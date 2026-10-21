# Tách triển khai BravoForest

Mã nguồn được chia thành hai vai trò triển khai, nhưng vẫn dùng chung một repository để cập nhật thuận tiện:

- `management/`: máy tính quản lý chạy API, worker, trang khách hàng và trang quản trị. Nhóm này không khởi động giao diện RVM.
- `pi/`: Raspberry Pi chạy duy nhất giao diện toàn màn hình RVM. Pi kết nối qua mạng LAN tới API trên máy quản lý.

Model AI và tiến trình GPIO/camera thuộc bộ điều khiển tin cậy trên Pi. Giao diện web RVM không trực tiếp điều khiển cảm biến và không gửi API key xuống trình duyệt.

Xem hướng dẫn chi tiết trong từng thư mục trước khi chạy.
