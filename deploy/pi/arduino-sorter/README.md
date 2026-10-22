# Tích hợp bộ phân loại Arduino với kiosk

Thư mục `reference/` giữ nguyên hai file thử nghiệm được cung cấp. Lệnh `start.sh` chạy luồng sản xuất đang có của dự án: kiosk, Pi AI controller và Arduino cùng hoạt động; dữ liệu phiên và điểm được lấy từ API/database.

## Khởi động trên Raspberry Pi

Từ thư mục gốc repo:

```sh
sh deploy/pi/arduino-sorter/start.sh
```

Trong terminal desktop thứ hai, mở giao diện kiosk toàn màn hình:

```sh
sh deploy/pi/launch-display.sh
```

Trước lần chạy đầu, cấu hình `deploy/pi/.env`, cài controller theo hướng dẫn ở [`../README.md`](../README.md), và nạp sketch sản xuất [`../arduino/bravoforest_rvm/bravoforest_rvm.ino`](../arduino/bravoforest_rvm/bravoforest_rvm.ino) vào Arduino.

Luồng dữ liệu thật:

1. Pi camera và model nhận diện chai PET/lon trong phiên kiosk đang gửi bao bì.
2. Controller gửi lệnh phân loại qua USB Serial; Arduino trả `RESULT` sau khi cảm biến và cơ cấu hoàn tất.
3. Kết quả hợp lệ được lưu vào hàng đợi cục bộ có khóa idempotency, rồi gửi đến API máy RVM.
4. API kiểm tra quy tắc từ database, ghi vật phẩm/điểm bằng logic phiên hiện có; kiosk đọc lại số liệu phiên từ server.

Không có dữ liệu đếm thử hoặc điểm giả được gửi vào kiosk. Nếu API mất kết nối, controller giữ sự kiện trong SQLite và thử gửi lại.

## Hai file thử nghiệm gốc

- `reference/arduino_sorter_test.ino` gửi trạng thái `ULTRASONIC:0/1` và `PROXIMITY:0/1`, nhận lệnh `MOTOR:*`/`SERVO:*`. Giao thức này khác firmware sản xuất, vốn nhận `ACCEPT PET`, `ACCEPT CAN`, `REJECT`, `CLEAR` và trả `RESULT`.
- `reference/test.cpython-310.pyc` là bytecode Python 3.10, cấu hình cổng `COM5` và dùng bộ đếm cục bộ. File không tích hợp API/database; không chạy file này trên Pi và không chạy song song với controller sản xuất vì hai tiến trình sẽ tranh camera và cổng Serial.

Hai file gốc được giữ để tham khảo. Thiết bị chạy thực tế phải dùng sketch sản xuất và controller hiện có để bảo đảm kiosk hiển thị kết quả đã ghi trong database.
