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

- `MANAGEMENT_API_URL`: địa chỉ LAN của máy tính quản lý, ví dụ `http://192.168.1.10:4000/api/v1`;
- `RVM_MACHINE_ID` và `RVM_API_KEY`: thông tin máy được cấp từ trang quản trị;
- `RVM_DISPLAY_PORT`: mặc định là `3002`.
- `PET_RULE_ID` và `CAN_RULE_ID`: ID quy tắc điểm cho chai PET và lon của máy;
- `CAMERA_BACKEND=opencv` cho USB camera hoặc `picamera2` cho Pi Camera CSI;
- `ARDUINO_SERIAL_PORT=auto` để tự tìm Arduino, hoặc đặt rõ như `/dev/ttyACM0`.

Không commit file `.env` vì file chứa API key của máy.

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

Để chạy cả giao diện RVM và camera AI:

```sh
sh deploy/pi/start-rvm.sh
```

Để chỉ mở camera AI thử model, chưa kết nối Arduino và chưa cần cấu hình API máy:

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
