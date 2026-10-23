# Raspberry Pi - giao diện máy RVM

Thư mục này cho phép Raspberry Pi chỉ chạy giao diện RVM. API, worker, trang khách hàng, trang quản trị, MariaDB và Redis vẫn chạy trên máy tính quản lý.

Docker image dùng `node:24-alpine` đa kiến trúc và được build trực tiếp trên Pi, nên không khóa cứng kiến trúc ARM.

## Cấu hình lần đầu

```sh
cd BravoForestRVM
cp deploy/pi/.env.example deploy/pi/.env
nano deploy/pi/.env
```

Điền:

- `MANAGEMENT_API_HOST`: tên máy tính quản lý trong mạng nội bộ, ví dụ `VanQuang.local` (trên Windows xem bằng lệnh `hostname`);
- `MANAGEMENT_API_PORT`: cổng API trên máy tính quản lý, mặc định `4000`;
- `MANAGEMENT_API_URL`: URL ban đầu; dịch vụ tự dò sẽ cập nhật IP mỗi khi đổi mạng;
- `RVM_MACHINE_ID` và `RVM_API_KEY`: thông tin máy được cấp từ trang quản trị;
- `RVM_DISPLAY_PORT`: mặc định là `3002`.
- `PET_RULE_ID` và `CAN_RULE_ID`: ID quy tắc điểm cho chai PET và lon của máy;
- `CAMERA_BACKEND=picamera2` cho Pi Camera CSI; dùng `opencv` khi chủ động chuyển sang USB camera;
- `CAMERA_DEVICE`: đường dẫn ổn định `/dev/v4l/by-id/...-video-index0` của camera USB; để trống thì dùng `CAMERA_INDEX`;
- `ARDUINO_SERIAL_PORT=auto` để tự tìm Arduino, hoặc đặt rõ như `/dev/ttyACM0`.
- `ARDUINO_PROTOCOL=legacy` cho sketch `arduino_sorter_test.ino` dùng lệnh `MOTOR:`/`SERVO:`; dùng `bravoforest` cho firmware trong `deploy/pi/arduino`.

Không commit file `.env` vì file chứa API key của máy.

Để Raspberry Pi tự theo máy tính khi IP đổi, cài watcher một lần sau khi cấu hình `.env`:

```sh
sh deploy/pi/install-api-discovery-autostart.sh
```

Watcher dùng mDNS (`<hostname>.local`) để tìm các IP của máy tính quản lý, gọi health check và chỉ chọn địa chỉ thực sự truy cập được. Cách này tránh chọn nhầm card mạng ảo WSL/Docker khi máy có nhiều IP. Hai máy cần cùng mạng và mạng đó phải cho phép thiết bị nhìn thấy nhau. Cổng API vẫn giữ nguyên `4000`; nếu API được chuyển sang cổng khác, cập nhật `MANAGEMENT_API_PORT`.

## Sau mỗi lần pull code

```sh
git pull --ff-only
sh deploy/pi/start.sh
```

Lệnh trên chỉ build và chạy service `rvm-display`. Kiểm tra trạng thái bằng:

```sh
docker compose --env-file deploy/pi/.env -f deploy/pi/docker-compose.yml ps
docker compose --env-file deploy/pi/.env -f deploy/pi/docker-compose.yml logs -f rvm-display
```

Mở giao diện toàn màn hình trong phiên desktop của Pi:

```sh
sh deploy/pi/launch-display.sh
```

Trang web không thể tự bật chế độ toàn màn hình khi bạn gõ URL do giới hạn bảo mật của trình duyệt. Raspberry Pi OS Labwc có thể tự mở kiosk toàn màn hình mỗi lần đăng nhập desktop; cài một lần:

```sh
sh deploy/pi/install-display-autostart.sh
```

Tính năng này cần Pi đăng nhập vào desktop; Labwc sẽ đợi giao diện RVM hoạt động rồi mở Chromium tại `http://127.0.0.1:3002` bằng chế độ kiosk. Tắt tự khởi chạy bằng:

```sh
sh deploy/pi/uninstall-display-autostart.sh
```

Dừng giao diện:

```sh
sh deploy/pi/stop.sh
```

## Bật camera AI và Arduino

Controller hỗ trợ cả sketch gốc `arduino_sorter_test.ino` và sketch [`arduino/bravoforest_rvm/bravoforest_rvm.ino`](arduino/bravoforest_rvm/bravoforest_rvm.ino). Chọn đúng `ARDUINO_PROTOCOL` trong `.env`; không cần nạp lại bo mạch khi dùng sketch gốc. Trên Raspberry Pi OS 64-bit, cài controller một lần:

Với `ARDUINO_PROTOCOL=legacy`, camera cho `clean_pet` và `can` đi xuôi khi vật còn trong khung hình, còn `dirty_pet` và `bottle_cap` đi ngược. Giao dịch chỉ được ghi khi cảm biến siêu âm giữ tín hiệu đủ một giây: nếu cảm biến tiệm cận cũng phát hiện trong khoảng đó thì servo đưa lon sang phải 180°, nếu không thì servo đưa chai sang trái 180°. Servo tự quay về giữa sau mỗi lần phân loại.

```sh
sudo apt update
sudo apt install -y python3-venv python3-opencv
# Chỉ cần dòng sau khi dùng camera CSI:
sudo apt install -y python3-picamera2
sh deploy/pi/install-controller.sh
```

Để chạy giao diện kiosk cùng controller camera AI và Arduino:

```sh
sh deploy/pi/arduino-sorter/start.sh
```

Để camera AI chỉ chạy trong thời gian kiosk hoạt động và tự nhả camera khi đóng kiosk, cài dịch vụ người dùng một lần:

```sh
sh deploy/pi/install-camera-ai-service.sh
```

Dùng lối tắt BravoForest trên Pi hoặc `sh deploy/pi/launch-display.sh` để mở kiosk. Lệnh này bật AI camera trước khi mở kiosk, rồi dừng dịch vụ khi đóng cửa sổ kiosk để giải phóng cảm biến cho ứng dụng Camera thông thường. Mở URL kiosk bằng trình duyệt trên một máy khác không thể tự khởi chạy tiến trình camera trên Pi; `127.0.0.1` cũng luôn trỏ tới chính máy đang chạy trình duyệt. Dịch vụ mở luồng tại `http://127.0.0.1:8765/stream.mjpg`; giao diện kiosk chỉ hiển thị luồng AI của Pi, không tự mở camera của máy đang duyệt web. Nếu ứng dụng Camera đang chiếm cảm biến, kiosk báo camera Pi đang bận và tự kết nối lại sau khi ứng dụng đó đóng. Ngược lại, nếu AI đang chiếm cảm biến, ứng dụng Camera sẽ báo thiết bị đang được sử dụng; đóng kiosk để giải phóng camera.

Muốn kiểm tra trạng thái dịch vụ:

```sh
systemctl --user status bravoforest-camera-ai.service
```

Camera thật được dùng độc quyền theo lượt: kiosk AI hoặc ứng dụng Camera Pi. Hai ứng dụng không cùng mở cảm biến; ứng dụng mở sau sẽ báo bận. Khi đóng ứng dụng đang giữ camera, ứng dụng còn lại có thể thử kết nối lại. Cách này không thay đổi model, cấu hình AI hoặc Arduino.

Lệnh này dùng controller sản xuất tại `deploy/pi/controller/main.py`, gửi kết quả được nhận và bị từ chối lên API để ghi database, rồi kiosk đọc lại số lượng và điểm từ database. Với database cũ, hãy chạy các migration RVM trong `database/migrations` theo thứ tự trước khi khởi động controller; controller sẽ kiểm tra các lý do từ chối có thật trong database. Mở giao diện toàn màn hình bằng `sh deploy/pi/launch-display.sh` trong phiên desktop của Pi. Có thể gọi trực tiếp `sh deploy/pi/start-rvm.sh` với cùng kết quả.

`start-camera-ai.sh` đọc cấu hình từ `deploy/pi/.env`. Khi thiếu Arduino, script luôn chuyển sang `CAMERA_ONLY`: camera vẫn có preview nhưng không ghi giao dịch và không cộng điểm. Với phiên vận hành đầy đủ, AI chỉ đưa ra quyết định phân loại; giao dịch hợp lệ chỉ được xếp hàng sau khi Arduino trả về `RESULT ... 1`. Để chủ động chỉ xem camera/model mà không ghi database, đặt `CAMERA_ONLY=true` rồi chạy:

```sh
sh deploy/pi/start-camera-ai.sh
```

Chế độ này chỉ nhận diện và hiển thị bounding box; nó không điều khiển motor, servo hoặc ghi số lượng lên server.
Preview camera-only được phục vụ nội bộ tại `http://127.0.0.1:8765`, phù hợp với desktop Wayland của Raspberry Pi.

Controller chạy foreground để có thể xem log. Nhấn `Ctrl+C` sẽ gửi lệnh `STOP` tới Arduino trước khi thoát. Nếu chỉ muốn giao diện, tiếp tục dùng `sh deploy/pi/start.sh`.

Tài khoản chạy controller cần truy cập được cổng Serial. Trên Raspberry Pi OS thường cấu hình bằng:

```sh
sudo usermod -aG dialout "$USER"
```

Đăng xuất rồi đăng nhập lại sau khi thêm group.

## Model và bộ điều khiển phần cứng

Model triển khai mặc định là NCNN tại `deploy/pi/models/best_ncnn_model`, phù hợp CPU ARM của Pi 4. Camera chạy 640×480, controller chỉ giữ frame mới nhất và suy luận mặc định 3 lần/giây ở `imgsz=320`. Controller chỉ chấp nhận chính xác `clean_pet` và `can`; `dirty_pet`, `bottle_cap` và mọi class khác đều bị trả ra. Giao diện web không chạy inference và không trực tiếp điều khiển GPIO. Xem chi tiết tại [`controller/README.md`](controller/README.md) và [`arduino/README.md`](arduino/README.md).
