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

`deploy/pi/start-camera-ai.sh` đọc `CAMERA_ONLY` và `AI_ONLY` từ `deploy/pi/.env`. `CAMERA_ONLY=true` chỉ xem camera/model và không ghi dữ liệu. `AI_ONLY=true` dùng AI camera làm nguồn quyết định, ghi nhận vật phẩm qua API mà không cần Arduino; script tự chuyển sang chế độ này khi thiếu Arduino và đã có cấu hình API. Nếu thiếu API hoặc rule ID, nó chỉ mở preview và không ghi giao dịch. Khi có Arduino, AI vẫn quyết định tính hợp lệ và ghi nhận item; Arduino chỉ chạy chu trình phân loại, kết quả phân loại không thay thế kết quả AI. Rule ID `0` làm vật liệu tương ứng bị AI từ chối.
