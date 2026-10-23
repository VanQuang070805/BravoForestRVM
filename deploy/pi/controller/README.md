# Pi AI controller

Controller đọc Pi Camera CSI bằng Picamera2 và chạy model Ultralytics NCNN tại `../models/best_ncnn_model`, sau đó trao đổi lệnh với Arduino qua USB Serial. Luồng camera chỉ giữ frame mới nhất; mặc định AI suy luận 3 lần/giây ở kích thước 320 để tránh tích tụ frame cũ trên Pi 4.

Luồng xử lý:

1. Class `clean_pet` hoặc `can` phải ổn định trong số frame cấu hình và máy phải có phiên `DEPOSITING`.
2. Pi gửi `ACCEPT PET` hoặc `ACCEPT CAN`; motor quay xuôi khi AI còn thấy vật hợp lệ và dừng khi vật rời khung hình.
3. Khi SRF05 giữ tín hiệu đủ một giây, cảm biến tiệm cận quyết định loại cuối cùng: không có kim loại là PET và servo gạt trái 180°; có kim loại là CAN và servo gạt phải 180°.
4. Chỉ sau khi servo quay về và Arduino/controller xác nhận cơ cấu hoàn tất thì giao dịch mới được ghi và cộng điểm.
5. Mọi class khác hoặc vật thể xuất hiện khi chưa có phiên sẽ nhận lệnh `REJECT`; motor quay ngược đến khi camera không còn thấy vật thể.
6. Vật phẩm hợp lệ được lưu bền vững trong SQLite trước khi đồng bộ tới API, tránh mất số lượng khi mạng chập chờn.

Các class hợp lệ được so khớp đúng tên, không dùng so khớp gần đúng.

`deploy/pi/start-camera-ai.sh` đọc cấu hình từ `deploy/pi/.env`. `CAMERA_ONLY=true` chỉ xem camera/model và không ghi dữ liệu. Nếu Arduino bị rút hoặc không mở được cổng serial, script tự chuyển sang `CAMERA_ONLY`; tuyệt đối không cộng điểm chỉ từ kết quả AI. Khi vận hành đầy đủ, AI gửi quyết định PET/CAN cho Arduino và controller chỉ ghi vật phẩm hợp lệ sau khi Arduino trả về kết quả hoàn tất. Rule ID `0` làm vật liệu tương ứng bị AI từ chối.
