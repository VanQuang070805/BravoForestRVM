# Pi AI controller

Controller đọc camera bằng Ultralytics YOLO và model `../models/best.pt`, sau đó trao đổi lệnh với Arduino qua USB Serial.

Luồng xử lý:

1. Class `clean_pet` hoặc `can` phải ổn định trong số frame cấu hình và máy phải có phiên `DEPOSITING`.
2. Pi gửi `ACCEPT PET` hoặc `ACCEPT CAN`; Arduino cho motor quay xuôi đến khi SRF05 xác nhận vật thể.
3. PET được servo gạt trái và ghi nhận `+1`.
4. Lon được LJ12A3 kiểm tra. Servo vẫn gạt phải trong cả hai trường hợp, nhưng chỉ lon có tín hiệu kim loại mới được ghi nhận `+1`; không có kim loại là `+0`.
5. Mọi class khác hoặc vật thể xuất hiện khi chưa có phiên sẽ nhận lệnh `REJECT`; motor quay ngược đến khi camera không còn thấy vật thể.
6. Vật phẩm hợp lệ được lưu bền vững trong SQLite trước khi đồng bộ tới API, tránh mất số lượng khi mạng chập chờn.

Các class hợp lệ được so khớp đúng tên, không dùng so khớp gần đúng.

Đặt `CAMERA_ONLY=true` để thử camera và model mà không cần Arduino hay thông tin xác thực máy. Script `deploy/pi/start-camera-ai.sh` tự bật chế độ này và mở cửa sổ preview.
