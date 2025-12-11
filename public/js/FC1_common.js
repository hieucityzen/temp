// Dùng đúng socket đã tạo ở home.ejs
const s = window.socket;

// ========= YÊU CẦU DỮ LIỆU TỪ SERVER =========
setInterval(() => {
    if (!s || !s.connected) return;
    s.emit("Client-send-data", "Request data client");
}, 100);

// Hàm hiển thị dữ liệu lên IO Field
function fn_IOFieldDataShow(tag, IOField, tofix) {
    s.on(tag, function (data) {
        const el = document.getElementById(IOField);
        if (!el) return;

        if (tofix === 0) el.value = data;
        else el.value = Number(data).toFixed(tofix);
    });
}

// Chuyển màn hình
function fn_ScreenChange(scr_1, scr_2, scr_3) {
    document.getElementById(scr_1).style.display = "block";
    document.getElementById(scr_2).style.display = "none";
    document.getElementById(scr_3).style.display = "none";
}

// Đổi màu nút (nếu bạn còn dùng)
function fn_btt_Color(tag, bttID, on_Color, off_Color) {
    s.on(tag, function (data) {
        const btn = document.getElementById(bttID);
        if (!btn) return;
        btn.style.backgroundColor = data ? on_Color : off_Color;
    });
}
