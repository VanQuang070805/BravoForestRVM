#!/usr/bin/env python3
"""BravoForest Raspberry Pi vision and Arduino controller."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import cv2
import requests
import serial
from serial.tools import list_ports
from ultralytics import YOLO


LOG = logging.getLogger("bravoforest-controller")
VALID_LABELS = {"clean_pet": "PET", "can": "CAN"}


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    camera_only: bool
    ai_only: bool
    api_url: str
    machine_id: int
    api_key: str
    pet_rule_id: int
    can_rule_id: int
    model_path: Path
    serial_port: str
    serial_baud: int
    camera_backend: str
    camera_index: int
    camera_width: int
    camera_height: int
    confidence: float
    image_size: int
    stable_frames: int
    clear_frames: int
    show_preview: bool
    preview_mode: str
    preview_port: int
    state_db: Path

    @classmethod
    def from_environment(cls) -> "Config":
        controller_dir = Path(__file__).resolve().parent
        pi_dir = controller_dir.parent
        repository_root = pi_dir.parent.parent
        camera_only = env_bool("CAMERA_ONLY")
        ai_only = env_bool("AI_ONLY")

        def configured_path(name: str, default: Path) -> Path:
            path = Path(os.getenv(name, str(default))).expanduser()
            return path if path.is_absolute() else repository_root / path

        config = cls(
            camera_only=camera_only,
            ai_only=ai_only,
            api_url=os.getenv("MANAGEMENT_API_URL", "").rstrip("/"),
            machine_id=0 if camera_only else int(os.getenv("RVM_MACHINE_ID", "0")),
            api_key=os.getenv("RVM_API_KEY", "").strip(),
            pet_rule_id=0 if camera_only else int(os.getenv("PET_RULE_ID", "0")),
            can_rule_id=0 if camera_only else int(os.getenv("CAN_RULE_ID", "0")),
            model_path=configured_path("MODEL_PATH", pi_dir / "models" / "best.pt"),
            serial_port=os.getenv("ARDUINO_SERIAL_PORT", "auto").strip(),
            serial_baud=int(os.getenv("ARDUINO_SERIAL_BAUD", "115200")),
            camera_backend=os.getenv("CAMERA_BACKEND", "opencv").strip().lower(),
            camera_index=int(os.getenv("CAMERA_INDEX", "0")),
            camera_width=int(os.getenv("CAMERA_WIDTH", "1280")),
            camera_height=int(os.getenv("CAMERA_HEIGHT", "720")),
            confidence=float(os.getenv("AI_CONFIDENCE", "0.70")),
            image_size=int(os.getenv("AI_IMAGE_SIZE", "640")),
            stable_frames=int(os.getenv("AI_STABLE_FRAMES", "5")),
            clear_frames=int(os.getenv("AI_CLEAR_FRAMES", "8")),
            show_preview=env_bool("SHOW_AI_PREVIEW"),
            preview_mode=os.getenv("AI_PREVIEW_MODE", "none").strip().lower(),
            preview_port=int(os.getenv("AI_PREVIEW_PORT", "8765")),
            state_db=configured_path("CONTROLLER_STATE_DB", pi_dir / "controller-state.sqlite3"),
        )
        config.validate()
        return config

    def validate(self) -> None:
        errors: list[str] = []
        if self.camera_only and self.ai_only:
            errors.append("CAMERA_ONLY và AI_ONLY không thể bật cùng lúc")
        if not self.camera_only:
            if not self.api_url.startswith(("http://", "https://")):
                errors.append("MANAGEMENT_API_URL phải bắt đầu bằng http:// hoặc https://")
            if self.machine_id < 1:
                errors.append("RVM_MACHINE_ID phải là số nguyên lớn hơn 0")
            if not self.api_key:
                errors.append("RVM_API_KEY chưa được cấu hình")
            if self.pet_rule_id < 0 or self.can_rule_id < 0:
                errors.append("PET_RULE_ID và CAN_RULE_ID không được là số âm")
            elif self.pet_rule_id == 0 and self.can_rule_id == 0:
                errors.append("Cần cấu hình ít nhất một rule bao bì đang hoạt động")
            elif self.pet_rule_id > 0 and self.pet_rule_id == self.can_rule_id:
                errors.append("PET_RULE_ID và CAN_RULE_ID phải là hai quy tắc khác nhau trong cơ sở dữ liệu")
        if not self.model_path.is_file():
            errors.append(f"Không tìm thấy model: {self.model_path}")
        if self.camera_backend not in {"opencv", "picamera2"}:
            errors.append("CAMERA_BACKEND chỉ nhận opencv hoặc picamera2")
        if not 0.0 < self.confidence <= 1.0:
            errors.append("AI_CONFIDENCE phải nằm trong khoảng (0, 1]")
        if self.stable_frames < 1 or self.clear_frames < 1:
            errors.append("AI_STABLE_FRAMES và AI_CLEAR_FRAMES phải lớn hơn 0")
        if self.preview_mode not in {"none", "opencv", "web"}:
            errors.append("AI_PREVIEW_MODE chỉ nhận none, opencv hoặc web")
        if not 1 <= self.preview_port <= 65535:
            errors.append("AI_PREVIEW_PORT phải nằm trong khoảng 1-65535")
        if errors:
            raise ValueError("; ".join(errors))


class WebPreview:
    def __init__(self, port: int) -> None:
        self.condition = threading.Condition()
        self.jpeg: bytes | None = None
        self.updated_at = 0.0
        preview = self

        class PreviewHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                request_path = urlsplit(self.path).path
                if request_path == "/health":
                    with preview.condition:
                        frame_age_ms = int((time.monotonic() - preview.updated_at) * 1000) if preview.jpeg else None
                    ready = frame_age_ms is not None and frame_age_ms < 10_000
                    payload = json.dumps({
                        "status": "ready" if ready else "starting",
                        "frameAgeMs": frame_age_ms,
                    }).encode("utf-8")
                    self.send_response(HTTPStatus.OK if ready else HTTPStatus.SERVICE_UNAVAILABLE)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(payload)))
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(payload)
                    return
                if request_path == "/":
                    page = (
                        "<!doctype html><html><head><meta charset='utf-8'>"
                        "<title>BravoForest AI</title><style>"
                        "html,body{margin:0;width:100%;height:100%;background:#050b08;overflow:hidden}"
                        "img{width:100%;height:100%;object-fit:contain}</style></head>"
                        "<body><img src='/stream.mjpg' alt='BravoForest AI'></body></html>"
                    ).encode("utf-8")
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(page)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(page)
                    return
                if request_path != "/stream.mjpg":
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
                self.end_headers()
                try:
                    while True:
                        with preview.condition:
                            preview.condition.wait(timeout=1.0)
                            jpeg = preview.jpeg
                        if jpeg is None:
                            continue
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii"))
                        self.wfile.write(jpeg)
                        self.wfile.write(b"\r\n")
                except (BrokenPipeError, ConnectionResetError):
                    return

            def log_message(self, format: str, *args: Any) -> None:
                LOG.debug("Preview HTTP: " + format, *args)

        self.server = ThreadingHTTPServer(("127.0.0.1", port), PreviewHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, name="web-preview", daemon=True)
        self.thread.start()
        LOG.info("Web preview: http://127.0.0.1:%d", port)

    def update(self, frame: Any) -> None:
        height, width = frame.shape[:2]
        if width > 640:
            frame = cv2.resize(
                frame,
                (640, max(1, round(height * 640 / width))),
                interpolation=cv2.INTER_AREA,
            )
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        if not ok:
            return
        with self.condition:
            self.jpeg = encoded.tobytes()
            self.updated_at = time.monotonic()
            self.condition.notify_all()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


class MachineApi:
    def __init__(self, config: Config) -> None:
        self.base_url = config.api_url
        self.machine_id = config.machine_id
        self.api_key = config.api_key
        self.session = requests.Session()

    def _headers(self) -> dict[str, str]:
        return {
            "x-machine-id": str(self.machine_id),
            "x-api-key": self.api_key,
            "x-request-nonce": uuid.uuid4().hex,
            "x-request-timestamp": str(int(time.time() * 1000)),
        }

    def active_session(self) -> dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/machine/sessions/active",
            headers=self._headers(),
            timeout=4,
        )
        response.raise_for_status()
        payload = response.json()
        session_id = payload.get("sessionId")
        return {
            "sessionId": str(session_id) if session_id is not None else None,
            "status": str(payload.get("status", "IDLE")),
            "finishRequested": bool(payload.get("finishRequested", False)),
        }

    def scan_options(self) -> dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/machine/scan-options",
            headers=self._headers(),
            timeout=5,
        )
        response.raise_for_status()
        return response.json()

    def record_item(self, event: dict[str, Any]) -> None:
        headers = self._headers()
        headers["x-idempotency-key"] = str(event["idempotencyKey"])
        payload = {"sensorData": event["sensorData"]}
        if event.get("ruleId") is not None:
            payload["ruleId"] = event["ruleId"]
        if event.get("rejectReasonId") is not None:
            payload["rejectReasonId"] = event["rejectReasonId"]
        response = self.session.post(
            f"{self.base_url}/machine/sessions/{event['sessionId']}/items",
            headers=headers,
            json=payload,
            timeout=5,
        )
        response.raise_for_status()

    def confirm_session(self, session_id: str) -> None:
        response = self.session.post(
            f"{self.base_url}/machine/sessions/{session_id}/confirm",
            headers=self._headers(),
            json={},
            timeout=5,
        )
        response.raise_for_status()

    def finalize_session(self, session_id: str) -> dict[str, Any]:
        response = self.session.post(
            f"{self.base_url}/machine/sessions/{session_id}/finalize",
            headers=self._headers(),
            json={},
            timeout=5,
        )
        response.raise_for_status()
        return response.json()


class PendingEventStore:
    """Persists accepted and rejected objects until the API acknowledges them."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.execute("BEGIN IMMEDIATE")
        self._create_table()
        columns = {row[1] for row in self.connection.execute("PRAGMA table_info(pending_item_events)")}
        if "reject_reason_id" not in columns:
            self.connection.execute("ALTER TABLE pending_item_events RENAME TO pending_item_events_legacy")
            self._create_table()
            self.connection.execute(
                """INSERT INTO pending_item_events
                   (idempotency_key,session_id,rule_id,reject_reason_id,sensor_data,created_at)
                   SELECT idempotency_key,session_id,rule_id,NULL,sensor_data,created_at
                   FROM pending_item_events_legacy"""
            )
            self.connection.execute("DROP TABLE pending_item_events_legacy")
        self.connection.commit()

    def _create_table(self) -> None:
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_item_events (
                idempotency_key TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                rule_id INTEGER,
                reject_reason_id INTEGER,
                sensor_data TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                CHECK ((rule_id IS NULL) != (reject_reason_id IS NULL))
            )
            """
        )

    def add(
        self,
        session_id: str,
        rule_id: int | None,
        sensor_data: dict[str, Any],
        reject_reason_id: int | None = None,
    ) -> str:
        if (rule_id is None) == (reject_reason_id is None):
            raise ValueError("Mỗi sự kiện phải có đúng một rule_id hoặc reject_reason_id")
        key = uuid.uuid4().hex
        self.connection.execute(
            "INSERT INTO pending_item_events VALUES (?, ?, ?, ?, ?, ?)",
            (key, session_id, rule_id, reject_reason_id, json.dumps(sensor_data), int(time.time())),
        )
        self.connection.commit()
        return key

    def pending(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT idempotency_key,session_id,rule_id,reject_reason_id,sensor_data FROM pending_item_events ORDER BY created_at"
        ).fetchall()
        pending_events = []
        for key, session_id, rule_id, reject_reason_id, sensor_data in rows:
            event = {"idempotencyKey": key, "sessionId": session_id, "sensorData": json.loads(sensor_data)}
            if rule_id is not None:
                event["ruleId"] = rule_id
            if reject_reason_id is not None:
                event["rejectReasonId"] = reject_reason_id
            pending_events.append(event)
        return pending_events

    def remove(self, key: str) -> None:
        self.connection.execute("DELETE FROM pending_item_events WHERE idempotency_key=?", (key,))
        self.connection.commit()

    def has_pending(self, session_id: str) -> bool:
        row = self.connection.execute(
            "SELECT 1 FROM pending_item_events WHERE session_id=? LIMIT 1",
            (session_id,),
        ).fetchone()
        return row is not None


class ArduinoLink:
    def __init__(self, port: str, baud: int) -> None:
        resolved_port = self._auto_port() if port.lower() == "auto" else port
        LOG.info("Mở Arduino tại %s (%d baud)", resolved_port, baud)
        self.serial = serial.Serial(resolved_port, baudrate=baud, timeout=0, write_timeout=1)
        self.buffer = bytearray()
        time.sleep(2.0)  # Most Arduino boards reset when the serial port is opened.

    @staticmethod
    def _auto_port() -> str:
        ports = list(list_ports.comports())
        preferred = [
            item for item in ports
            if any(token in f"{item.description} {item.manufacturer or ''}".lower()
                   for token in ("arduino", "ch340", "usb serial", "cp210"))
        ]
        candidates = preferred or ports
        if not candidates:
            raise RuntimeError("Không tìm thấy Arduino. Kiểm tra cáp USB và quyền truy cập cổng serial.")
        if len(candidates) > 1:
            LOG.warning("Có nhiều cổng serial; tự chọn %s", candidates[0].device)
        return candidates[0].device

    def send(self, command: str) -> None:
        LOG.info("PI -> ARDUINO: %s", command)
        self.serial.write(f"{command}\n".encode("ascii"))
        self.serial.flush()

    def read_lines(self) -> list[str]:
        waiting = self.serial.in_waiting
        if waiting:
            self.buffer.extend(self.serial.read(waiting))
        lines: list[str] = []
        while b"\n" in self.buffer:
            raw, _, remainder = self.buffer.partition(b"\n")
            self.buffer = bytearray(remainder)
            line = raw.decode("utf-8", errors="replace").strip()
            if line:
                lines.append(line)
        return lines

    def close(self) -> None:
        if self.serial.is_open:
            try:
                self.send("STOP")
            finally:
                self.serial.close()


class Camera:
    def __init__(self, config: Config) -> None:
        self.backend = config.camera_backend
        self.capture: Any
        if self.backend == "picamera2":
            try:
                from picamera2 import Picamera2
            except ImportError as error:
                raise RuntimeError(
                    "Thiếu Picamera2. Cài bằng: sudo apt install python3-picamera2"
                ) from error
            camera = Picamera2()
            camera.configure(camera.create_preview_configuration(
                main={"format": "RGB888", "size": (config.camera_width, config.camera_height)}
            ))
            camera.start()
            self.capture = camera
        else:
            capture = cv2.VideoCapture(config.camera_index)
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, config.camera_width)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, config.camera_height)
            if not capture.isOpened():
                raise RuntimeError(f"Không mở được camera index {config.camera_index}")
            self.capture = capture

    def read(self) -> Any:
        if self.backend == "picamera2":
            rgb_frame = self.capture.capture_array()
            return cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR)
        ok, frame = self.capture.read()
        if not ok:
            raise RuntimeError("Camera không trả về frame")
        return frame

    def close(self) -> None:
        if self.backend == "picamera2":
            self.capture.stop()
        else:
            self.capture.release()


@dataclass
class Detection:
    label: str
    confidence: float
    boxes: tuple[tuple[int, int, int, int, str, float], ...] = ()


class VisionController:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.api = None if config.camera_only else MachineApi(config)
        self.events = None if config.camera_only else PendingEventStore(config.state_db)
        self.model = YOLO(str(config.model_path))
        raw_names = self.model.names.values() if isinstance(self.model.names, dict) else self.model.names
        model_labels = {str(name).strip().lower() for name in raw_names}
        missing = set(VALID_LABELS) - model_labels
        if missing:
            raise RuntimeError(f"Model thiếu class bắt buộc: {', '.join(sorted(missing))}")
        LOG.info("Model labels: %s", ", ".join(sorted(model_labels)))

        self.reject_reason_ids: dict[str, int] = {}
        if self.api:
            try:
                options = self.api.scan_options()
                configured_rules = {
                    rule_id for rule_id in (config.pet_rule_id, config.can_rule_id)
                    if rule_id > 0
                }
                available = {
                    int(item["rule_id"]): item
                    for item in options.get("items", [])
                    if item.get("rule_id") is not None
                }
                self.reject_reason_ids = {
                    str(reason["code"]): int(reason["reject_reason_id"])
                    for reason in options.get("rejectReasons", [])
                    if reason.get("code") and reason.get("reject_reason_id") is not None
                }
            except (requests.RequestException, KeyError, TypeError, ValueError) as error:
                raise RuntimeError(f"Không xác minh được quy tắc bao bì từ cơ sở dữ liệu: {error}") from error
            missing_rules = configured_rules - available.keys()
            if missing_rules:
                raise RuntimeError(
                    "PET_RULE_ID/CAN_RULE_ID không còn là quy tắc đang hoạt động của máy trong cơ sở dữ liệu: "
                    + ", ".join(str(rule_id) for rule_id in sorted(missing_rules))
                )
            expected_material_codes = {"PET": "PET", "CAN": "ALU"}
            for material, rule_id in (("PET", config.pet_rule_id), ("CAN", config.can_rule_id)):
                if rule_id <= 0:
                    continue
                database_code = str(available[rule_id].get("material_code", "")).strip().upper()
                if database_code != expected_material_codes[material]:
                    raise RuntimeError(
                        f"Rule {rule_id} không khớp vật liệu AI {material}: "
                        f"database trả về {database_code or 'không rõ'}"
                    )
            missing_reasons = {"SENSOR_REJECTED", "UNSUPPORTED_MATERIAL"} - self.reject_reason_ids.keys()
            if missing_reasons:
                raise RuntimeError(
                    "Cơ sở dữ liệu thiếu lý do từ chối: " + ", ".join(sorted(missing_reasons))
                    + "; hãy chạy migration và seed_reference_data.sql"
                )
            for material, rule_id in (("PET", config.pet_rule_id), ("CAN", config.can_rule_id)):
                if rule_id > 0:
                    LOG.info(
                        "Đã xác minh rule %s=%s (%s) từ cơ sở dữ liệu",
                        material, rule_id, available[rule_id].get("container_name", ""),
                    )
                else:
                    LOG.info("Không có rule %s đang hoạt động; controller sẽ từ chối vật liệu này", material)

        self.arduino = None if config.camera_only or config.ai_only else ArduinoLink(config.serial_port, config.serial_baud)
        try:
            self.camera = Camera(config)
        except Exception:
            if self.arduino:
                self.arduino.close()
            raise
        self.mode = "CAMERA_ONLY" if config.camera_only else "IDLE"
        self.pending_object: dict[str, Any] | None = None
        self.candidate_label: str | None = None
        self.candidate_frames = 0
        self.clear_frames = 0
        self.active_session_id: str | None = None
        self.active_session_status = "IDLE"
        self.finish_requested = False
        self.last_session_poll = 0.0
        self.last_queue_flush = 0.0

    def detect(self, frame: Any, *, render_preview: bool | None = None) -> tuple[Detection | None, Any]:
        result = self.model.predict(
            source=frame,
            conf=self.config.confidence,
            imgsz=self.config.image_size,
            verbose=False,
        )[0]
        if result.boxes is None:
            raise RuntimeError("best.pt không phải model object detection có bounding boxes")
        best: Detection | None = None
        detected_boxes: list[tuple[int, int, int, int, str, float]] = []
        for box in result.boxes:
            confidence = float(box.conf[0])
            class_id = int(box.cls[0])
            label = str(result.names[class_id]).strip().lower()
            x1, y1, x2, y2 = (int(round(value)) for value in box.xyxy[0].tolist())
            detected_boxes.append((x1, y1, x2, y2, label, confidence))
            if best is None or confidence > best.confidence:
                best = Detection(label, confidence)
        if best is not None:
            best.boxes = tuple(detected_boxes)
        needs_preview = (
            self.config.show_preview or self.config.preview_mode != "none"
            if render_preview is None else render_preview
        )
        annotated = result.plot() if needs_preview else frame
        return best, annotated

    def update_candidate(self, detection: Detection | None) -> bool:
        label = detection.label if detection else None
        if label is None:
            self.candidate_label = None
            self.candidate_frames = 0
            return False
        if label == self.candidate_label:
            self.candidate_frames += 1
        else:
            self.candidate_label = label
            self.candidate_frames = 1
        return self.candidate_frames >= self.config.stable_frames

    def refresh_active_session(self) -> None:
        if self.api is None:
            return
        now = time.monotonic()
        if now - self.last_session_poll < 1.0:
            return
        self.last_session_poll = now
        try:
            active = self.api.active_session()
            session_id = active["sessionId"]
            if session_id != self.active_session_id:
                LOG.info("Phiên DEPOSITING hiện tại: %s", session_id or "không có")
            self.active_session_id = session_id
            self.active_session_status = active["status"]
            self.finish_requested = active["finishRequested"]
        except requests.RequestException as error:
            self.active_session_id = None
            self.active_session_status = "IDLE"
            self.finish_requested = False
            LOG.warning("Không lấy được phiên hoạt động: %s", error)

    def finalize_if_ready(self) -> None:
        session_id = self.active_session_id
        if (
            self.api is None or self.events is None or session_id is None
            or not self.finish_requested or self.mode != "IDLE" or self.pending_object is not None
            or self.events.has_pending(session_id)
            or self.active_session_status not in {"DEPOSITING", "PROCESSING"}
        ):
            return

        try:
            if self.active_session_status == "DEPOSITING":
                self.api.confirm_session(session_id)
                self.active_session_status = "PROCESSING"
            result = self.api.finalize_session(session_id)
            self.active_session_status = "COMPLETED"
            LOG.info(
                "Đã hoàn tất phiên %s từ dữ liệu cơ sở dữ liệu: %s bao bì, %s điểm",
                session_id,
                result.get("acceptedItems", 0),
                result.get("points", 0),
            )
        except requests.RequestException as error:
            # Keep the persisted finish request. The next poll retries safely; finalization is idempotent.
            LOG.warning("Chưa hoàn tất được phiên %s, sẽ thử lại: %s", session_id, error)

    def flush_events(self) -> None:
        if self.api is None or self.events is None:
            return
        now = time.monotonic()
        if now - self.last_queue_flush < 1.0:
            return
        self.last_queue_flush = now
        for event in self.events.pending():
            try:
                self.api.record_item(event)
                self.events.remove(str(event["idempotencyKey"]))
                LOG.info("Đã đồng bộ vật phẩm vào phiên %s", event["sessionId"])
            except requests.RequestException as error:
                LOG.warning("Chưa đồng bộ được vật phẩm, sẽ thử lại: %s", error)
                break

    def process_arduino(self) -> None:
        if self.arduino is None:
            return
        for line in self.arduino.read_lines():
            LOG.info("ARDUINO -> PI: %s", line)
            parts = line.split()
            if line == "READY":
                self.mode = "IDLE"
                self.pending_object = None
                self.clear_frames = 0
                self.candidate_label = None
                self.candidate_frames = 0
            elif len(parts) == 3 and parts[0] == "RESULT" and self.pending_object:
                LOG.info(
                    "Arduino hoàn tất chu trình %s (kết quả %s); quyết định hợp lệ đã do AI ghi nhận",
                    parts[1], "đạt" if parts[2] == "1" else "không đạt",
                )
                self.mode = "WAIT_CLEAR"
                self.pending_object = None
            elif line.startswith("ERROR FEED_TIMEOUT") or line.startswith("ERROR REJECT_TIMEOUT"):
                self.mode = "WAIT_CLEAR"
                self.pending_object = None

    def handle_idle_detection(self, detection: Detection | None, stable: bool) -> None:
        if not detection or not stable:
            return

        object_type = VALID_LABELS.get(detection.label)
        rule_id = (
            self.config.pet_rule_id if object_type == "PET"
            else self.config.can_rule_id if object_type == "CAN"
            else 0
        )
        has_active_rule = rule_id > 0
        if (
            object_type and has_active_rule and self.active_session_id
            and self.active_session_status == "DEPOSITING" and not self.finish_requested
        ):
            self.pending_object = {
                "label": detection.label,
                "objectType": object_type,
                "confidence": detection.confidence,
                "sessionId": self.active_session_id,
            }
            if self.events is None:
                raise RuntimeError("Kho lưu sự kiện chưa được khởi tạo")
            key = self.events.add(str(self.active_session_id), rule_id, {
                "source": "pi-yolo-ai",
                "classificationSource": "CAMERA_AI",
                "aiClass": detection.label,
                "aiConfidence": round(float(detection.confidence), 4),
                "classificationAccepted": True,
            })
            if self.arduino is None:
                raise RuntimeError("Arduino chưa được khởi tạo")
            self.arduino.send(f"ACCEPT {object_type}")
            self.mode = "ACCEPTING"
            LOG.info("AI chấp nhận %s, confidence %.3f; đã xếp hàng giao dịch %s", detection.label, detection.confidence, key)
        else:
            if object_type is None:
                reason = f"class không hợp lệ: {detection.label}"
            elif not has_active_rule:
                reason = f"chưa có rule {object_type} đang hoạt động trong database"
            else:
                reason = "không có phiên DEPOSITING"
            LOG.info("Trả vật thể ra (%s)", reason)
            if (
                (object_type is None or not has_active_rule) and self.active_session_id
                and self.active_session_status == "DEPOSITING" and not self.finish_requested
            ):
                if self.events is None:
                    raise RuntimeError("Kho lưu sự kiện chưa được khởi tạo")
                sensor_data = {
                    "source": "pi-yolo-ai",
                    "classificationSource": "CAMERA_AI",
                    "aiClass": detection.label,
                    "aiConfidence": round(float(detection.confidence), 4),
                    "classificationAccepted": False,
                    "reason": reason,
                }
                self.events.add(
                    self.active_session_id,
                    None,
                    sensor_data,
                    reject_reason_id=self.reject_reason_ids["UNSUPPORTED_MATERIAL"],
                )
            self.pending_object = None
            if self.arduino is None:
                raise RuntimeError("Arduino chưa được khởi tạo")
            self.arduino.send("REJECT")
            self.mode = "REJECTING"

        self.candidate_label = None
        self.candidate_frames = 0

    def handle_ai_only_detection(self, detection: Detection | None) -> None:
        if not detection:
            return

        object_type = VALID_LABELS.get(detection.label)
        rule_id = (
            self.config.pet_rule_id if object_type == "PET"
            else self.config.can_rule_id if object_type == "CAN"
            else 0
        )
        session_id = self.active_session_id
        if (
            not session_id or self.active_session_status != "DEPOSITING"
            or self.finish_requested or self.events is None
        ):
            LOG.info("AI nhận diện %s nhưng chưa có phiên gửi đang hoạt động; không ghi giao dịch", detection.label)
        elif object_type and rule_id > 0:
            key = self.events.add(session_id, rule_id, {
                "source": "pi-yolo-ai",
                "classificationSource": "CAMERA_AI",
                "aiClass": detection.label,
                "aiConfidence": round(float(detection.confidence), 4),
                "classificationAccepted": True,
            })
            LOG.info("AI_ONLY chấp nhận %s (%.3f), đã xếp hàng giao dịch %s", detection.label, detection.confidence, key)
        else:
            reason = f"class không hợp lệ: {detection.label}" if object_type is None else f"chưa có rule {object_type} đang hoạt động trong database"
            key = self.events.add(session_id, None, {
                "source": "pi-yolo-ai",
                "classificationSource": "CAMERA_AI",
                "aiClass": detection.label,
                "aiConfidence": round(float(detection.confidence), 4),
                "classificationAccepted": False,
                "reason": reason,
            }, reject_reason_id=self.reject_reason_ids["UNSUPPORTED_MATERIAL"])
            LOG.info("AI_ONLY từ chối %s, đã ghi nhận hoạt động %s", detection.label, key)

        self.mode = "WAIT_CLEAR"
        self.candidate_label = None
        self.candidate_frames = 0

    def handle_clear_detection(self, detection: Detection | None) -> None:
        if detection is None:
            self.clear_frames += 1
        else:
            self.clear_frames = 0
        if self.clear_frames >= self.config.clear_frames:
            if self.arduino is None:
                raise RuntimeError("Arduino chưa được khởi tạo")
            self.arduino.send("CLEAR")
            self.mode = "CLEARING"
            self.clear_frames = 0

    def run(self) -> None:
        if self.config.camera_only or self.config.ai_only:
            self.run_camera_only()
            return
        if self.arduino is None:
            raise RuntimeError("Arduino chưa được khởi tạo")
        self.arduino.send("STOP")
        web_preview = WebPreview(self.config.preview_port) if self.config.preview_mode == "web" else None
        LOG.info("Controller sẵn sàng. Nhấn Ctrl+C để dừng an toàn.")
        try:
            while True:
                self.process_arduino()
                self.refresh_active_session()
                self.flush_events()
                self.finalize_if_ready()

                frame = self.camera.read()
                detection, annotated = self.detect(frame)
                stable = self.update_candidate(detection) if self.mode == "IDLE" else False

                if self.mode == "IDLE":
                    self.handle_idle_detection(detection, stable)
                elif self.mode in {"REJECTING", "WAIT_CLEAR"}:
                    self.handle_clear_detection(detection)

                if web_preview:
                    web_preview.update(annotated)
                if self.config.show_preview:
                    label = detection.label if detection else "none"
                    cv2.putText(annotated, f"{self.mode} | {label}", (20, 35),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
                    cv2.imshow("BravoForest AI", annotated)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
        finally:
            self.arduino.close()
            self.camera.close()
            if web_preview:
                web_preview.close()
            cv2.destroyAllWindows()

    def run_camera_only(self) -> None:
        if self.config.ai_only:
            LOG.info("Đang chạy AI_ONLY: AI camera quyết định và ghi vật phẩm; không phụ thuộc Arduino")
        else:
            LOG.info("Đang chạy CAMERA_ONLY: chỉ xem camera/model, không ghi dữ liệu API")
        last_logged_label: str | None = None
        last_log_at = 0.0
        web_preview = WebPreview(self.config.preview_port) if self.config.preview_mode == "web" else None
        if web_preview:
            condition = threading.Condition()
            capture_stopped = threading.Event()
            latest: dict[str, Any] = {
                "frame": None,
                "sequence": 0,
                "label": "none",
                "confidence": 0.0,
                "boxes": (),
                "detection_at": 0.0,
            }

            def capture_frames() -> None:
                last_preview_at = 0.0
                while not capture_stopped.is_set():
                    try:
                        frame = self.camera.read()
                    except Exception as error:
                        LOG.warning("Không đọc được camera Pi: %s", error)
                        capture_stopped.wait(0.25)
                        continue

                    with condition:
                        latest["frame"] = frame
                        latest["sequence"] += 1
                        label = latest["label"]
                        confidence = latest["confidence"]
                        boxes = latest["boxes"]
                        detection_age = time.monotonic() - latest["detection_at"]
                        condition.notify_all()

                    now = time.monotonic()
                    if now - last_preview_at >= 0.1:
                        preview_frame = frame.copy()
                        if detection_age <= 2.5:
                            for x1, y1, x2, y2, box_label, box_confidence in boxes:
                                color = (65, 210, 105) if box_label in VALID_LABELS else (0, 190, 255)
                                cv2.rectangle(preview_frame, (x1, y1), (x2, y2), color, 3)
                                text = f"{box_label.upper()} {box_confidence:.2f}"
                                (text_width, text_height), baseline = cv2.getTextSize(
                                    text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2
                                )
                                top = max(0, y1 - text_height - baseline - 8)
                                cv2.rectangle(
                                    preview_frame,
                                    (x1, top),
                                    (x1 + text_width + 12, top + text_height + baseline + 8),
                                    color,
                                    cv2.FILLED,
                                )
                                cv2.putText(
                                    preview_frame,
                                    text,
                                    (x1 + 6, top + text_height + 2),
                                    cv2.FONT_HERSHEY_SIMPLEX,
                                    0.7,
                                    (255, 255, 255),
                                    2,
                                    cv2.LINE_AA,
                                )
                        ai_session_open = bool(
                            self.active_session_id
                            and self.active_session_status == "DEPOSITING"
                            and not self.finish_requested
                        )
                        overlay_status = (
                            "AI: PHIEN MO" if ai_session_open else "AI: CHO PHIEN"
                        ) if self.config.ai_only else "CAMERA ONLY"
                        cv2.putText(
                            preview_frame,
                            f"{overlay_status} | {label} {confidence:.2f}",
                            (20, 35),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.9,
                            (0, 255, 0) if label in VALID_LABELS else (0, 255, 255),
                            2,
                        )
                        web_preview.update(preview_frame)
                        last_preview_at = now

            capture_thread = threading.Thread(
                target=capture_frames,
                name="camera-preview-capture",
                daemon=True,
            )
            capture_thread.start()
            sequence = 0
        try:
            while True:
                if self.config.ai_only:
                    self.refresh_active_session()
                    self.flush_events()
                    self.finalize_if_ready()

                if web_preview:
                    with condition:
                        condition.wait_for(
                            lambda: latest["frame"] is not None and latest["sequence"] != sequence,
                            timeout=1.0,
                        )
                        if latest["frame"] is None or latest["sequence"] == sequence:
                            continue
                        frame = latest["frame"].copy()
                        sequence = latest["sequence"]
                else:
                    frame = self.camera.read()

                render_camera_preview = bool(
                    not web_preview
                    and (self.config.show_preview or self.config.preview_mode == "opencv")
                )
                detection, annotated = self.detect(frame, render_preview=render_camera_preview)
                label = detection.label if detection else "none"
                confidence = detection.confidence if detection else 0.0
                if web_preview:
                    with condition:
                        latest["label"] = label
                        latest["confidence"] = confidence
                        latest["boxes"] = detection.boxes if detection else ()
                        latest["detection_at"] = time.monotonic()
                if self.config.ai_only:
                    if self.mode == "IDLE":
                        if self.update_candidate(detection):
                            self.handle_ai_only_detection(detection)
                    elif self.mode == "WAIT_CLEAR":
                        self.clear_frames = self.clear_frames + 1 if detection is None else 0
                        if self.clear_frames >= self.config.clear_frames:
                            self.mode = "IDLE"
                            self.clear_frames = 0
                            self.candidate_label = None
                            self.candidate_frames = 0
                now = time.monotonic()
                if detection and (label != last_logged_label or now - last_log_at >= 1.0):
                    LOG.info("AI: %s (%.3f)", label, confidence)
                    last_logged_label = label
                    last_log_at = now
                elif not detection:
                    last_logged_label = None

                ai_session_open = bool(
                    self.active_session_id
                    and self.active_session_status == "DEPOSITING"
                    and not self.finish_requested
                )
                overlay_status = (
                    "AI: PHIEN MO" if ai_session_open else "AI: CHO PHIEN"
                ) if self.config.ai_only else "CAMERA ONLY"
                cv2.putText(
                    annotated,
                    f"{overlay_status} | {label} {confidence:.2f}",
                    (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.9,
                    (0, 255, 0) if label in VALID_LABELS else (0, 0, 255),
                    2,
                )
                if not web_preview and (self.config.show_preview or self.config.preview_mode == "opencv"):
                    cv2.imshow("BravoForest AI", annotated)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
        finally:
            if web_preview:
                capture_stopped.set()
                capture_thread.join(timeout=2.0)
            if web_preview:
                web_preview.close()
            self.camera.close()
            cv2.destroyAllWindows()


def main() -> int:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        VisionController(Config.from_environment()).run()
        return 0
    except (ValueError, RuntimeError, serial.SerialException) as error:
        LOG.error("Không thể khởi động controller: %s", error)
        return 1
    except KeyboardInterrupt:
        LOG.info("Đã dừng controller")
        return 0


if __name__ == "__main__":
    sys.exit(main())
