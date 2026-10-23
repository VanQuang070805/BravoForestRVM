# Model AI trên Raspberry Pi

- Model PyTorch dự phòng: `deploy/pi/models/best.pt`
- Model NCNN mặc định cho Raspberry Pi 4: `deploy/pi/models/best_ncnn_model`

Model thuộc tiến trình controller camera/cảm biến, không thuộc container giao diện web. Thư mục NCNN chỉ chứa `model.ncnn.param`, `model.ncnn.bin` và `metadata.yaml`; tệp Python/bytecode trong gói nguồn không được đưa vào dự án hoặc thực thi.
