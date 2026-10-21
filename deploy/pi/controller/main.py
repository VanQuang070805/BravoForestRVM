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

        def configured_path(name: str, default: Path) -> Path:
            path = Path(os.getenv(name, str(default))).expanduser()
            return path if path.is_absolute() else repository_root / path

        config = cls(
            camera_only=camera_only,
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
        if not self.camera_only:
            if not self.api_url.startswith(("http://", "https://")):
                errors.append("MANAGEMENT_API_URL phải bắt đầu bằng http:// hoặc https://")
            if self.machine_id < 1:
                errors.append("RVM_MACHINE_ID phải là số nguyên lớn hơn 0")
            if not self.api_key:
                errors.append("RVM_API_KEY chưa được cấu hình")
            if self.pet_rule_id < 1 or self.can_rule_id < 1:
                errors.append("PET_RULE_ID và CAN_RULE_ID phải là rule_id hợp lệ trong trang quản trị")
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
        preview = self

        class PreviewHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                if self.path == "/":
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
                if self.path != "/stream.mjpg":
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
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
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            return
        with self.condition:
            self.jpeg = encoded.tobytes()
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

    def active_session(self) -> str | None:
        response = self.session.get(
            f"{self.base_url}/machine/sessions/active",
            headers=self._headers(),
            timeout=4,
        )
        response.raise_for_status()
        payload = response.json()
        session_id = payload.get("sessionId")
        return str(session_id) if session_id is not None else None

    def record_item(self, event: dict[str, Any]) -> None:
        headers = self._headers()
        headers["x-idempotency-key"] = str(event["idempotencyKey"])
        response = self.session.post(
            f"{self.base_url}/machine/sessions/{event['sessionId']}/items",
            headers=headers,
            json={
                "ruleId": event["ruleId"],
                "sensorData": event["sensorData"],
            },
            timeout=5,
        )
        response.raise_for_status()


class PendingEventStore:
    """Persists accepted objects until the management API acknowledges them."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_item_events (
                idempotency_key TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                rule_id INTEGER NOT NULL,
                sensor_data TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        self.connection.commit()

    def add(self, session_id: str, rule_id: int, sensor_data: dict[str, Any]) -> str:
        key = uuid.uuid4().hex
        self.connection.execute(
            "INSERT INTO pending_item_events VALUES (?, ?, ?, ?, ?)",
            (key, session_id, rule_id, json.dumps(sensor_data), int(time.time())),
        )
        self.connection.commit()
        return key

    def pending(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT idempotency_key,session_id,rule_id,sensor_data FROM pending_item_events ORDER BY created_at"
        ).fetchall()
        return [
            {
                "idempotencyKey": row[0],
                "sessionId": row[1],
                "ruleId": row[2],
                "sensorData": json.loads(row[3]),
            }
            for row in rows
        ]

    def remove(self, key: str) -> None:
        self.connection.execute("DELETE FROM pending_item_events WHERE idempotency_key=?", (key,))
        self.connection.commit()


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

        self.arduino = None if config.camera_only else ArduinoLink(config.serial_port, config.serial_baud)
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
        self.last_session_poll = 0.0
        self.last_queue_flush = 0.0

    def detect(self, frame: Any) -> tuple[Detection | None, Any]:
        result = self.model.predict(
            source=frame,
            conf=self.config.confidence,
            imgsz=self.config.image_size,
            verbose=False,
        )[0]
        if result.boxes is None:
            raise RuntimeError("best.pt không phải model object detection có bounding boxes")
        best: Detection | None = None
        for box in result.boxes:
            confidence = float(box.conf[0])
            class_id = int(box.cls[0])
            label = str(result.names[class_id]).strip().lower()
            if best is None or confidence > best.confidence:
                best = Detection(label, confidence)
        needs_preview = self.config.show_preview or self.config.preview_mode != "none"
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
            session_id = self.api.active_session()
            if session_id != self.active_session_id:
                LOG.info("Phiên DEPOSITING hiện tại: %s", session_id or "không có")
            self.active_session_id = session_id
        except requests.RequestException as error:
            self.active_session_id = None
            LOG.warning("Không lấy được phiên hoạt động: %s", error)

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
                object_type = parts[1]
                accepted = parts[2] == "1"
                expected_type = self.pending_object["objectType"]
                if object_type != expected_type:
                    LOG.error("Kết quả Arduino không khớp: đợi %s, nhận %s", expected_type, object_type)
                elif accepted:
                    rule_id = self.config.pet_rule_id if object_type == "PET" else self.config.can_rule_id
                    sensor_data = {
                        "source": "pi-yolo-arduino",
                        "aiClass": self.pending_object["label"],
                        "aiConfidence": round(float(self.pending_object["confidence"]), 4),
                        "ultrasonicConfirmed": True,
                        "metalConfirmed": object_type == "CAN",
                    }
                    if self.events is None:
                        raise RuntimeError("Kho lưu sự kiện chưa được khởi tạo")
                    key = self.events.add(str(self.pending_object["sessionId"]), rule_id, sensor_data)
                    LOG.info("Đã xếp hàng vật phẩm hợp lệ %s (%s)", object_type, key)
                else:
                    LOG.info("Lon không được cảm biến kim loại xác nhận: không tăng số lượng")
                self.mode = "WAIT_CLEAR"
            elif line.startswith("ERROR FEED_TIMEOUT") or line.startswith("ERROR REJECT_TIMEOUT"):
                self.mode = "WAIT_CLEAR"

    def handle_idle_detection(self, detection: Detection | None, stable: bool) -> None:
        if not detection or not stable:
            return

        object_type = VALID_LABELS.get(detection.label)
        if object_type and self.active_session_id:
            self.pending_object = {
                "label": detection.label,
                "objectType": object_type,
                "confidence": detection.confidence,
                "sessionId": self.active_session_id,
            }
            if self.arduino is None:
                raise RuntimeError("Arduino chưa được khởi tạo")
            self.arduino.send(f"ACCEPT {object_type}")
            self.mode = "ACCEPTING"
            LOG.info("Chấp nhận %s, confidence %.3f", detection.label, detection.confidence)
        else:
            reason = "không có phiên DEPOSITING" if object_type else f"class không hợp lệ: {detection.label}"
            LOG.info("Trả vật thể ra (%s)", reason)
            self.pending_object = None
            if self.arduino is None:
                raise RuntimeError("Arduino chưa được khởi tạo")
            self.arduino.send("REJECT")
            self.mode = "REJECTING"

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
        if self.config.camera_only:
            self.run_camera_only()
            return
        if self.arduino is None:
            raise RuntimeError("Arduino chưa được khởi tạo")
        self.arduino.send("STOP")
        LOG.info("Controller sẵn sàng. Nhấn Ctrl+C để dừng an toàn.")
        try:
            while True:
                self.process_arduino()
                self.refresh_active_session()
                self.flush_events()

                frame = self.camera.read()
                detection, annotated = self.detect(frame)
                stable = self.update_candidate(detection) if self.mode == "IDLE" else False

                if self.mode == "IDLE":
                    self.handle_idle_detection(detection, stable)
                elif self.mode in {"REJECTING", "WAIT_CLEAR"}:
                    self.handle_clear_detection(detection)

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
            cv2.destroyAllWindows()

    def run_camera_only(self) -> None:
        LOG.info("Đang chạy CAMERA_ONLY: không kết nối Arduino và không ghi dữ liệu API")
        last_logged_label: str | None = None
        last_log_at = 0.0
        web_preview = WebPreview(self.config.preview_port) if self.config.preview_mode == "web" else None
        try:
            while True:
                frame = self.camera.read()
                detection, annotated = self.detect(frame)
                label = detection.label if detection else "none"
                confidence = detection.confidence if detection else 0.0
                now = time.monotonic()
                if detection and (label != last_logged_label or now - last_log_at >= 1.0):
                    LOG.info("AI: %s (%.3f)", label, confidence)
                    last_logged_label = label
                    last_log_at = now
                elif not detection:
                    last_logged_label = None

                cv2.putText(
                    annotated,
                    f"CAMERA ONLY | {label} {confidence:.2f}",
                    (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.9,
                    (0, 255, 0) if label in VALID_LABELS else (0, 0, 255),
                    2,
                )
                if web_preview:
                    web_preview.update(annotated)
                elif self.config.show_preview or self.config.preview_mode == "opencv":
                    cv2.imshow("BravoForest AI", annotated)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
        finally:
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
