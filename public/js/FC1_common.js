////////// YÊU CẦU DỮ LIỆU TỪ SERVER- REQUEST DATA ////////////
var myVar = setInterval(myTimer, 100);
function myTimer() {
    socket.emit("Client-send-data", "Request data client");
}

// Hàm hiển thị dữ liệu lên IO Field
function fn_IOFieldDataShow(tag, IOField, tofix){
    socket.on(tag, function(data){
        if(tofix == 0){
            document.getElementById(IOField).value = data;
        } else {
            document.getElementById(IOField).value = data.toFixed(tofix);
        }
    });
}
function fn_ScreenChange(scr_1, scr_2, scr_3) {
    document.getElementById(scr_1).style.display = 'block'; // Hiện
    document.getElementById(scr_2).style.display = 'none';  // Ẩn hoàn toàn 1
    document.getElementById(scr_3).style.display = 'none';  // Ẩn hoàn toàn 2
}


// Hàm hiển thị màu nút nhấn
function fn_btt_Color(tag, bttID, on_Color, off_Color){
    socket.on(tag,function(data){
        if(data == true){
            document.getElementById(bttID).style.backgroundColor = on_Color;
        } else{
            document.getElementById(bttID).style.backgroundColor = off_Color;
        }
    });
}