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
- `CAMERA_BACKEND=opencv` cho USB camera hoặc `picamera2` cho Pi Camera CSI;
- `ARDUINO_SERIAL_PORT=auto` để tự tìm Arduino, hoặc đặt rõ như `/dev/ttyACM0`.

Không commit file `.env` vì file chứa API key của máy.

Để Raspberry Pi tự theo máy tính khi IP đổi, cài watcher một lần sau khi cấu hình `.env`:

```sh
sh deploy/pi/install-api-discovery-autostart.sh
```

Watcher dùng mDNS (`<hostname>.local`) để tìm IP máy tính quản lý rồi cập nhật URL cho kiosk và camera AI. Hai máy cần cùng mạng và mạng đó phải cho phép thiết bị nhìn thấy nhau. Cổng API vẫn giữ nguyên `4000`; nếu API được chuyển sang cổng khác, cập nhật `MANAGEMENT_API_PORT`.

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

Nạp sketch [`arduino/bravoforest_rvm/bravoforest_rvm.ino`](arduino/bravoforest_rvm/bravoforest_rvm.ino) vào Arduino trước. Trên Raspberry Pi OS 64-bit, cài controller một lần:

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

Để camera AI luôn chạy cùng giao diện kiosk và tự khởi động lại nếu tiến trình bị dừng, cài dịch vụ người dùng một lần:

```sh
sh deploy/pi/install-camera-ai-autostart.sh
```

Dịch vụ mở luồng xem camera nội bộ tại `http://127.0.0.1:8765/stream.mjpg`; giao diện kiosk hiển thị luồng này ở cạnh phải trên màn hình 1024×600 và tự kết nối lại nếu camera tạm ngắt. Muốn kiểm tra dịch vụ:

```sh
systemctl --user status bravoforest-camera-ai.service
```

Lệnh này dùng controller sản xuất tại `deploy/pi/controller/main.py`, gửi kết quả được nhận và bị từ chối lên API để ghi database, rồi kiosk đọc lại số lượng và điểm từ database. Với database cũ, hãy chạy các migration RVM trong `database/migrations` theo thứ tự trước khi khởi động controller; controller sẽ kiểm tra các lý do từ chối có thật trong database. Mở giao diện toàn màn hình bằng `sh deploy/pi/launch-display.sh` trong phiên desktop của Pi. Có thể gọi trực tiếp `sh deploy/pi/start-rvm.sh` với cùng kết quả.

`start-camera-ai.sh` đọc `CAMERA_ONLY` và `AI_ONLY` từ `deploy/pi/.env`. Khi thiếu Arduino nhưng cấu hình API đã đủ, script chuyển sang `AI_ONLY`: AI camera vẫn xác minh loại bao bì, ghi hoạt động vào API/database và cho kiosk cập nhật phiên. Nếu thiếu cấu hình API, nó chỉ mở preview; nếu có Arduino, thiết bị chỉ chạy sorter và kết quả phân loại không quyết định điểm. Để chỉ xem camera/model mà không ghi database, đặt `CAMERA_ONLY=true` rồi chạy:

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

Model đã train được lưu tại `deploy/pi/models/best.pt`. Controller chỉ chấp nhận chính xác `clean_pet` và `can`; `dirty_pet`, `bottle_cap` và mọi class khác đều bị trả ra. Giao diện web không chạy inference và không trực tiếp điều khiển GPIO. Xem chi tiết tại [`controller/README.md`](controller/README.md) và [`arduino/README.md`](arduino/README.md).
