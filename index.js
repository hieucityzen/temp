///////////////////// KẾT NỐI KEPWARE QUA REST API /////////////////////
const axios = require("axios");

// ================== KẾT NỐI MYSQL ==================
const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "123456",
  database: "scada_db"
});

// ================== CẤU HÌNH IOT GATEWAY ==================
const KEP_BASE_URL = "http://127.0.0.1:5000/iotgateway";
const KEP_USER = "administrator";
const KEP_PASS = "";
const DEVICE_PREFIX = "Channel1.Device1.";

// ================== ĐỊNH NGHĨA TAG ==================
const BTT_AUTO          = "BTT_AUTO";
const BTT_MANUAL        = "BTT_MANUAL";
const MANUAL_START_DC_1 = "MANUAL_START_DC_1";
const MANUAL_STOP_DC1   = "MANUAL_STOP_DC1";
const MANUAL_START_DC_2 = "MANUAL_START_DC_2";
const MANUAL_STOP_DC2   = "MANUAL_STOP_DC2";
const AUTO_START        = "AUTO_START";
const AUTO_STOP         = "AUTO_STOP";

const SP_DC1            = "SP_DC1";
const SP_DC2            = "SP_DC2";
const SP_VAI_REF        = "SP_VAI_REF";
const SS_FAULT          = "SS_FAULT";

const RESET_SYSTEM      = "RESET_SYSTEM";
const RESET_DC1         = "RESET_DC1";
const RESET_DC2         = "RESET_DC2";
const FAULT_ALL         = "FAULT_ALL";   // đèn lỗi tổng

// ================== LIST CÁC TAG ĐỂ ĐỌC LIÊN TỤC ==================
const TAG_IDS = [
  DEVICE_PREFIX + BTT_AUTO,          // 0
  DEVICE_PREFIX + BTT_MANUAL,        // 1
  DEVICE_PREFIX + MANUAL_START_DC_1, // 2
  DEVICE_PREFIX + MANUAL_STOP_DC1,   // 3
  DEVICE_PREFIX + MANUAL_START_DC_2, // 4
  DEVICE_PREFIX + MANUAL_STOP_DC2,   // 5
  DEVICE_PREFIX + AUTO_START,        // 6
  DEVICE_PREFIX + AUTO_STOP,         // 7
  DEVICE_PREFIX + SP_DC1,            // 8
  DEVICE_PREFIX + SP_DC2,            // 9
  DEVICE_PREFIX + SP_VAI_REF,        // 10
  DEVICE_PREFIX + SS_FAULT,          // 11
  DEVICE_PREFIX + FAULT_ALL          // 12
];

let isAuto   = false;
let isManual = true;
let tagArr   = [];

// ================== GHI EVENT LOG ==================
async function logEvent(text) {
  try {
    await db.execute(
      "INSERT INTO log_events (ts, event_text) VALUES (NOW(), ?)",
      [text]
    );
    console.log(">>> EVENT:", text);
  } catch (err) {
    console.log("Lỗi ghi event log:", err.message);
  }
}

// ================== GHI LỊCH SỬ log_tags ==================
function boolToInt(v) {
  if (v === null || v === undefined) return null;
  return v ? 1 : 0;
}

async function logToDatabase() {
  try {
    // cần đủ 13 phần tử (0..12)
    if (tagArr.length < 13) return;

    const sql = `
      INSERT INTO log_tags (
        ts,
        BTT_AUTO, BTT_MANUAL,
        MANUAL_START_DC_1, MANUAL_STOP_DC1,
        MANUAL_START_DC_2, MANUAL_STOP_DC2,
        AUTO_START, AUTO_STOP,
        SP_DC1, SP_DC2, SP_VAI_REF,
        SS_FAULT, FAULT_ALL
      )
      VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      boolToInt(tagArr[0]),  // BTT_AUTO
      boolToInt(tagArr[1]),  // BTT_MANUAL
      boolToInt(tagArr[2]),  // MANUAL_START_DC_1
      boolToInt(tagArr[3]),  // MANUAL_STOP_DC1
      boolToInt(tagArr[4]),  // MANUAL_START_DC_2
      boolToInt(tagArr[5]),  // MANUAL_STOP_DC2
      boolToInt(tagArr[6]),  // AUTO_START
      boolToInt(tagArr[7]),  // AUTO_STOP
      tagArr[8]  ?? null,    // SP_DC1
      tagArr[9]  ?? null,    // SP_DC2
      tagArr[10] ?? null,    // SP_VAI_REF
      boolToInt(tagArr[11]), // SS_FAULT
      boolToInt(tagArr[12])  // FAULT_ALL
    ];

    await db.execute(sql, params);
    console.log(">>> Ghi log MySQL OK");
  } catch (err) {
    console.error("Lỗi ghi MySQL:", err.message);
  }
}

// ================== HÀM ĐỌC KEPWARE ==================
async function fn_tagRead() {
  try {
    const query = TAG_IDS.map(id => "ids=" + encodeURIComponent(id)).join("&");

    const res = await axios.get(`${KEP_BASE_URL}/read?${query}`, {
      auth: { username: KEP_USER, password: KEP_PASS }
    });

    const results = res.data.readResults || [];

    tagArr = TAG_IDS.map(id => {
      const item = results.find(r => r.id === id);
      return item && item.s ? item.v : null;
    });

    isAuto   = !!tagArr[0];
    isManual = !!tagArr[1];

    console.log("TAG VALUES:", tagArr);

    fn_emit_tags();
    await logToDatabase();
  } catch (e) {
    console.log("Lỗi fn_tagRead:", e.message);
  }
}

// ================== VIẾT TAG KEPWARE ==================
async function fn_Data_Write(tag, value) {
  try {
    const body = [{ id: DEVICE_PREFIX + tag, v: value }];

    await axios.post(`${KEP_BASE_URL}/write`, body, {
      auth: { username: KEP_USER, password: KEP_PASS },
      headers: { "Content-Type": "application/json" }
    });

    console.log(`GHI TAG ${tag} = ${value} OK`);
  } catch (e) {
    console.log("Lỗi fn_Data_Write:", e.message);
  }
}

// ================== TIMER QUÉT 1S ==================
setInterval(fn_tagRead, 1000);

// ================== WEB SERVER ==================
const express = require("express");
const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", "./views");

const server = require("http").Server(app);
const io = require("socket.io")(server);
server.listen(3000);

app.get("/", (req, res) => {
  res.render("home");
});

app.get("/logs", async (req, res) => {
  try {
    const selectedDate = req.query.date || "";

    let historySql  = "";
    let historyArgs = [];
    let eventsSql   = "";
    let eventsArgs  = [];

    if (selectedDate) {
      historySql = `
        SELECT *
        FROM log_tags
        WHERE DATE(ts) = ?
        ORDER BY ts DESC
        LIMIT 500
      `;
      eventsSql = `
        SELECT *
        FROM log_events
        WHERE DATE(ts) = ?
        ORDER BY ts DESC
        LIMIT 500
      `;
      historyArgs = [selectedDate];
      eventsArgs  = [selectedDate];
    } else {
      historySql = `
        SELECT *
        FROM log_tags
        ORDER BY ts DESC
        LIMIT 200
      `;

      eventsSql = `
        SELECT *
        FROM log_events
        ORDER BY ts DESC
        LIMIT 200
      `;
    }

    const [history] = await db.query(historySql, historyArgs);
    const [events]  = await db.query(eventsSql, eventsArgs);

    res.render("logs_page", {
      history,
      events,
      selectedDate   // ⬅ phải truyền biến này sang ejs
    });

  } catch (err) {
    console.error("Lỗi /logs:", err.message);
    res.status(500).send("DB error: " + err.message);
  }
});


// ================== GỬI TAG TỚI WEB ==================
function fn_emit_tags() {
  io.sockets.emit("BTT_AUTO",          tagArr[0]);
  io.sockets.emit("BTT_MANUAL",        tagArr[1]);
  io.sockets.emit("MANUAL_START_DC_1", tagArr[2]);
  io.sockets.emit("MANUAL_STOP_DC1",   tagArr[3]);
  io.sockets.emit("MANUAL_START_DC_2", tagArr[4]);
  io.sockets.emit("MANUAL_STOP_DC2",   tagArr[5]);
  io.sockets.emit("AUTO_START",        tagArr[6]);
  io.sockets.emit("AUTO_STOP",         tagArr[7]);
  io.sockets.emit("SP_DC1",            tagArr[8]);
  io.sockets.emit("SP_DC2",            tagArr[9]);
  io.sockets.emit("SP_VAI_REF",        tagArr[10]);
  io.sockets.emit("SS_FAULT",          tagArr[11]);
  io.sockets.emit("FAULT_ALL",         tagArr[12]);
}

// ================== SOCKET.IO ==================
io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  socket.on("Client-send-data", () => fn_emit_tags());

  // ==== AUTO MODE ====
  socket.on("mode_auto", async () => {
    await logEvent("Chuyển chế độ AUTO");
    await fn_Data_Write(BTT_AUTO, true);
    await fn_Data_Write(BTT_MANUAL, false);
    await fn_Data_Write(MANUAL_STOP_DC1, false);
    await fn_Data_Write(MANUAL_STOP_DC2, false);
    await fn_tagRead();
  });

  // ==== MANUAL MODE ====
  socket.on("mode_manual", async () => {
    await logEvent("Chuyển chế độ MANUAL");
    await fn_Data_Write(BTT_AUTO, false);
    await fn_Data_Write(BTT_MANUAL, true);
    await fn_tagRead();
  });

  // ==== AUTO START ====
  socket.on("auto_start", async () => {
    if (!isAuto) return;
    await logEvent("AUTO START");
    await fn_Data_Write(AUTO_START, true);
    await fn_Data_Write(AUTO_STOP, false);
    await fn_Data_Write(MANUAL_START_DC_1, true);
    await fn_Data_Write(MANUAL_START_DC_2, true);
    await fn_tagRead();
  });

  // ==== AUTO STOP ====
  socket.on("auto_stop", async () => {
    if (!isAuto) return;
    await logEvent("AUTO STOP");
    await fn_Data_Write(AUTO_START, false);
    await fn_Data_Write(AUTO_STOP, true);
    await fn_Data_Write(MANUAL_START_DC_1, false);
    await fn_Data_Write(MANUAL_START_DC_2, false);
    await fn_tagRead();
  });

  // ==== MANUAL DC1 ====
  socket.on("m_start_dc1", async () => {
    if (!isManual) return;
    await logEvent("START DC1 (Manual)");
    await fn_Data_Write(MANUAL_START_DC_1, true);
    await fn_Data_Write(MANUAL_STOP_DC1, false);
    await fn_tagRead();
  });

  socket.on("m_stop_dc1", async () => {
    if (!isManual) return;
    await logEvent("STOP DC1 (Manual)");
    await fn_Data_Write(MANUAL_START_DC_1, false);
    await fn_Data_Write(MANUAL_STOP_DC1, true);
    await fn_tagRead();
  });

  // ==== MANUAL DC2 ====
  socket.on("m_start_dc2", async () => {
    if (!isManual) return;
    await logEvent("START DC2 (Manual)");
    await fn_Data_Write(MANUAL_START_DC_2, true);
    await fn_Data_Write(MANUAL_STOP_DC2, false);
    await fn_tagRead();
  });

  socket.on("m_stop_dc2", async () => {
    if (!isManual) return;
    await logEvent("STOP DC2 (Manual)");
    await fn_Data_Write(MANUAL_START_DC_2, false);
    await fn_Data_Write(MANUAL_STOP_DC2, true);
    await fn_tagRead();
  });

  // ==== RESET SYSTEM ====
  socket.on("reset_system", async () => {
    await logEvent("RESET SYSTEM");
    await fn_Data_Write(BTT_AUTO, false);
    await fn_Data_Write(BTT_MANUAL, false);
    await fn_Data_Write(AUTO_START, false);
    await fn_Data_Write(AUTO_STOP, false);
    await fn_Data_Write(MANUAL_START_DC_1, false);
    await fn_Data_Write(MANUAL_STOP_DC1, false);
    await fn_Data_Write(MANUAL_START_DC_2, false);
    await fn_Data_Write(MANUAL_STOP_DC2, false);
    await fn_Data_Write(FAULT_ALL, false);

    await fn_tagRead();
  });

  socket.on("reset_dc1", async () => {
    await logEvent("RESET DC1");
    await fn_Data_Write(MANUAL_START_DC_1, false);
    await fn_Data_Write(MANUAL_STOP_DC1, false);
    await fn_tagRead();
  });

  socket.on("reset_dc2", async () => {
    await logEvent("RESET DC2");
    await fn_Data_Write(MANUAL_START_DC_2, false);
    await fn_Data_Write(MANUAL_STOP_DC2, false);
    await fn_tagRead();
  });

  // ==== SET ANALOG ====
  socket.on("set_sp_dc1", async (value) => {
    await logEvent(`SET SP_DC1 = ${value}`);
    await fn_Data_Write(SP_DC1, Number(value));
    await fn_tagRead();
  });

  socket.on("set_sp_dc2", async (value) => {
    await logEvent(`SET SP_DC2 = ${value}`);
    await fn_Data_Write(SP_DC2, Number(value));
    await fn_tagRead();
  });

  socket.on("set_sp_vai_ref", async (value) => {
    await logEvent(`SET SP_VAI_REF = ${value}`);
    await fn_Data_Write(SP_VAI_REF, Number(value));
    await fn_tagRead();
  });

  // ❌ KHÔNG xử lý FAULT_ALL ở SERVER bằng document (đã bỏ đoạn sai)
});
