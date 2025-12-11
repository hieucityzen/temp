///////////////////// KẾT NỐI KEPWARE QUA REST API /////////////////////
const axios = require("axios");

// ================== KẾT NỐI MYSQL ==================
const mysql = require("mysql2/promise");
const ExcelJS = require("exceljs");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "123456",
  database: "scada_db",
});

// ================== CẤU HÌNH IOT GATEWAY ==================
const KEP_BASE_URL = "http://127.0.0.1:5000/iotgateway";
const KEP_USER = "administrator";
const KEP_PASS = "";
const DEVICE_PREFIX = "Channel1.Device1.";

// ================== ĐỊNH NGHĨA TAG BUTTON (xung 2s) ==================
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

// ================== ĐÈN TRẠNG THÁI (LAMP TAGS) ==================
const LAMP_AUTO_TAG = "LAMP_AUTO";   // đèn báo Auto
const LAMP_MAN_TAG  = "LAMP_MAN";    // đèn báo Manual
const LAMP_DC1_TAG  = "M_startdc1";  // đèn DC1
const LAMP_DC2_TAG  = "M_STARTDC2";  // đèn DC2

// các bit fault / reset
const SS_FAULT    = "SS_FAULT";      // reset hệ thống (xung 1→0)
const FAULT_ALL   = "FAULT_ALL";     // đèn lỗi tổng
const M_FAULT_DC1 = "M_FAULT_DC1";   // reset DC1 (xung 1→0)
const M_FAULT_DC2 = "M_FAULT_DC2";   // reset DC2 (xung 1→0);

// alias
const RESET_SYSTEM = SS_FAULT;
const RESET_DC1    = M_FAULT_DC1;
const RESET_DC2    = M_FAULT_DC2;

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
  DEVICE_PREFIX + FAULT_ALL,         // 12
  DEVICE_PREFIX + M_FAULT_DC1,       // 13
  DEVICE_PREFIX + M_FAULT_DC2,       // 14
  DEVICE_PREFIX + LAMP_AUTO_TAG,     // 15
  DEVICE_PREFIX + LAMP_MAN_TAG,      // 16
  DEVICE_PREFIX + LAMP_DC1_TAG,      // 17
  DEVICE_PREFIX + LAMP_DC2_TAG       // 18
];

let tagArr   = [];
let isAuto   = false;  // dựa trên LAMP_AUTO
let isManual = false;  // dựa trên LAMP_MAN

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
    if (tagArr.length < 15) return;

    const sql = `
      INSERT INTO log_tags (
        ts,
        BTT_AUTO, BTT_MANUAL,
        MANUAL_START_DC_1, MANUAL_STOP_DC1,
        MANUAL_START_DC_2, MANUAL_STOP_DC2,
        AUTO_START, AUTO_STOP,
        SP_DC1, SP_DC2, SP_VAI_REF,
        SS_FAULT, FAULT_ALL,
        M_FAULT_DC1, M_FAULT_DC2
      )
      VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      boolToInt(tagArr[0]),
      boolToInt(tagArr[1]),
      boolToInt(tagArr[2]),
      boolToInt(tagArr[3]),
      boolToInt(tagArr[4]),
      boolToInt(tagArr[5]),
      boolToInt(tagArr[6]),
      boolToInt(tagArr[7]),
      tagArr[8]  ?? null,
      tagArr[9]  ?? null,
      tagArr[10] ?? null,
      boolToInt(tagArr[11]),
      boolToInt(tagArr[12]),
      boolToInt(tagArr[13]),
      boolToInt(tagArr[14])
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
      auth: { username: KEP_USER, password: KEP_PASS },
    });

    console.log("RAW READ DATA:", JSON.stringify(res.data));  // debug

    let results;
    if (Array.isArray(res.data)) {
      results = res.data;
    } else if (Array.isArray(res.data.readResults)) {
      results = res.data.readResults;
    } else {
      results = [];
    }

    // Bỏ check quality, lấy luôn v
    tagArr = TAG_IDS.map(id => {
      const item = results.find(r => r.id === id);
      return item ? item.v : null;
    });

    // cập nhật mode dựa trên đèn
    isAuto   = !!tagArr[15];
    isManual = !!tagArr[16];

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
    const url  = `${KEP_BASE_URL}/write`;
    const body = [{ id: DEVICE_PREFIX + tag, v: value }];

    console.log(">>> WRITE URL:", url);
    console.log(">>> WRITE BODY:", JSON.stringify(body));

    const res = await axios.post(url, body, {
      auth: { username: KEP_USER, password: KEP_PASS },
      headers: { "Content-Type": "application/json" },
    });

    console.log(`GHI TAG ${tag} = ${value} OK, status =`, res.status);
  } catch (e) {
    if (e.response) {
      console.log(
        "Lỗi fn_Data_Write:",
        "status =", e.response.status,
        "data   =", JSON.stringify(e.response.data)
      );
    } else {
      console.log("Lỗi fn_Data_Write (no response):", e.message);
    }
  }
}

/**
 * Tạo xung 1 -> 0 cho tag trong durationMs (mặc định 2000 ms)
 */
async function pulseTag(tag, durationMs = 2000) {
  try {
    console.log(">>> pulseTag START:", tag);
    await fn_Data_Write(tag, true);
    await fn_tagRead();

    setTimeout(async () => {
      console.log(">>> pulseTag END  :", tag);
      await fn_Data_Write(tag, false);
      await fn_tagRead();
    }, durationMs);
  } catch (e) {
    console.log("Lỗi pulseTag:", e.message);
  }
}

// ================== RESET TOÀN BỘ TAG VỀ 0 ==================
async function resetAllTags() {
  try {
    const boolTags = [
      BTT_AUTO, BTT_MANUAL,
      MANUAL_START_DC_1, MANUAL_STOP_DC1,
      MANUAL_START_DC_2, MANUAL_STOP_DC2,
      AUTO_START, AUTO_STOP,
      SS_FAULT, FAULT_ALL,
      M_FAULT_DC1, M_FAULT_DC2,
      LAMP_AUTO_TAG, LAMP_MAN_TAG,
      LAMP_DC1_TAG, LAMP_DC2_TAG
    ];

    for (const t of boolTags) {
      await fn_Data_Write(t, false);
    }

    // nếu muốn reset luôn tốc độ:
    await fn_Data_Write(SP_DC1, 0);
    await fn_Data_Write(SP_DC2, 0);
    // await fn_Data_Write(SP_VAI_REF, 0);

    console.log(">>> RESET: tất cả tag đã đưa về 0");
  } catch (e) {
    console.log("Lỗi resetAllTags:", e.message);
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
server.listen(3000, "0.0.0.0", () => {
  console.log("Server dang chay tai cong 3000");
});

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
      selectedDate,
    });
  } catch (err) {
    console.error("Lỗi /logs:", err.message);
    res.status(500).send("DB error: " + err.message);
  }
});

app.get("/logs/export", async (req, res) => {
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
        ORDER BY ts ASC
      `;
      eventsSql = `
        SELECT *
        FROM log_events
        WHERE DATE(ts) = ?
        ORDER BY ts ASC
      `;
      historyArgs = [selectedDate];
      eventsArgs  = [selectedDate];
    } else {
      // nếu không chọn ngày -> xuất nhiều bản ghi gần nhất
      historySql = `
        SELECT *
        FROM log_tags
        ORDER BY ts ASC
        LIMIT 500
      `;
      eventsSql = `
        SELECT *
        FROM log_events
        ORDER BY ts ASC
        LIMIT 500
      `;
    }

    const [history] = await db.query(historySql, historyArgs);
    const [events]  = await db.query(eventsSql, eventsArgs);

    // ===== TẠO WORKBOOK EXCEL =====
    const workbook  = new ExcelJS.Workbook();
    const sheetA    = workbook.addWorksheet("Lịch sử tag");
    const sheetB    = workbook.addWorksheet("Event log");

    // ---- Sheet A: giống bảng trên EJS ----
    sheetA.addRow([
      "Thời gian",
      "BTT_AUTO",
      "BTT_MANUAL",
      "START_DC1",
      "STOP_DC1",
      "START_DC2",
      "STOP_DC2",
      "AUTO_START",
      "AUTO_STOP",
      "SP_DC1",
      "SP_DC2",
      "SP_VAI_REF",
      "FAULT",
      "FAULT_ALL",
      "SS_FAULT",
      "M_FAULT_DC1",
      "M_FAULT_DC2"
    ]);

    history.forEach(row => {
      sheetA.addRow([
        row.ts,
        row.BTT_AUTO,
        row.BTT_MANUAL,
        row.MANUAL_START_DC_1,
        row.MANUAL_STOP_DC1,
        row.MANUAL_START_DC_2,
        row.MANUAL_STOP_DC2,
        row.AUTO_START,
        row.AUTO_STOP,
        row.SP_DC1,
        row.SP_DC2,
        row.SP_VAI_REF,
        row.SS_FAULT,     // cột FAULT
        row.FAULT_ALL,
        row.SS_FAULT,     // cột SS_FAULT
        row.M_FAULT_DC1,
        row.M_FAULT_DC2
      ]);
    });

    // ---- Sheet B: Event log ----
    sheetB.addRow(["Thời gian", "Sự kiện"]);
    events.forEach(e => {
      sheetB.addRow([e.ts, e.event_text]);
    });

    // Auto width cho đẹp (không bắt buộc)
    [sheetA, sheetB].forEach(sheet => {
      sheet.columns.forEach(column => {
        let maxLength = 10;
        column.eachCell({ includeEmpty: true }, cell => {
          const v = cell.value ? cell.value.toString() : "";
          maxLength = Math.max(maxLength, v.length);
        });
        column.width = maxLength + 2;
      });
    });

    // ===== GỬI FILE VỀ CHO CLIENT =====
    const fileDate = selectedDate || "all";
    const fileName = `logs_${fileDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Lỗi /logs/export:", err.message);
    res.status(500).send("Không xuất được Excel: " + err.message);
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
  io.sockets.emit("M_FAULT_DC1",       tagArr[13]);
  io.sockets.emit("M_FAULT_DC2",       tagArr[14]);

  // ĐÈN TRẠNG THÁI
  io.sockets.emit("LAMP_AUTO",   tagArr[15]);
  io.sockets.emit("LAMP_MAN",    tagArr[16]);
  io.sockets.emit("M_startdc1",  tagArr[17]);
  io.sockets.emit("M_STARTDC2",  tagArr[18]);
}

// ================== SOCKET.IO ==================
io.on("connection", (socket) => {
  console.log("== NEW CLIENT CONNECTED ==", socket.id);

  socket.onAny((event, ...args) => {
    console.log(">>> SOCKET EVENT:", event, args);
  });

  socket.on("Client-send-data", () => fn_tagRead());

  // ==== AUTO MODE ====
  socket.on("mode_auto", async () => {
    await logEvent("Chuyển chế độ AUTO");

    await pulseTag(BTT_AUTO, 2000);

    // Đèn: AUTO ON, MAN OFF, DC1/DC2 OFF
    await fn_Data_Write(LAMP_AUTO_TAG, true);
    await fn_Data_Write(LAMP_MAN_TAG,  false);
    await fn_Data_Write(LAMP_DC1_TAG,  false);
    await fn_Data_Write(LAMP_DC2_TAG,  false);
    await fn_tagRead();
  });

  // ==== MANUAL MODE ====
  socket.on("mode_manual", async () => {
    await logEvent("Chuyển chế độ MANUAL");

    await pulseTag(BTT_MANUAL, 2000);

    // Đèn: MAN ON, AUTO OFF
    await fn_Data_Write(LAMP_AUTO_TAG, false);
    await fn_Data_Write(LAMP_MAN_TAG,  true);
    await fn_tagRead();
  });

  // ==== AUTO START / STOP (chỉ khi đang AUTO) ====
  socket.on("auto_start", async () => {
    if (!isAuto) {
      console.log("Bỏ qua AUTO START vì chưa ở chế độ AUTO");
      return;
    }
    await logEvent("AUTO START");
    await pulseTag(AUTO_START, 2000);
  });

  socket.on("auto_stop", async () => {
    if (!isAuto) {
      console.log("Bỏ qua AUTO STOP vì chưa ở chế độ AUTO");
      return;
    }
    await logEvent("AUTO STOP");
    await pulseTag(AUTO_STOP, 2000);
  });

  // ==== MANUAL DC1 ==== (chỉ khi MANUAL)
  socket.on("m_start_dc1", async () => {
    if (!isManual) {
      console.log("Bỏ qua START DC1 vì chưa ở MANUAL");
      return;
    }
    await logEvent("START DC1 (Manual)");
    await pulseTag(MANUAL_START_DC_1, 2000);

    await fn_Data_Write(LAMP_DC1_TAG, true); // đèn DC1 sáng
    await fn_tagRead();
  });

  socket.on("m_stop_dc1", async () => {
    if (!isManual) {
      console.log("Bỏ qua STOP DC1 vì chưa ở MANUAL");
      return;
    }
    await logEvent("STOP DC1 (Manual)");
    await pulseTag(MANUAL_STOP_DC1, 2000);

    await fn_Data_Write(LAMP_DC1_TAG, false); // đèn DC1 tắt
    await fn_tagRead();
  });

  // ==== MANUAL DC2 ==== (chỉ khi MANUAL)
  socket.on("m_start_dc2", async () => {
    if (!isManual) {
      console.log("Bỏ qua START DC2 vì chưa ở MANUAL");
      return;
    }
    await logEvent("START DC2 (Manual)");
    await pulseTag(MANUAL_START_DC_2, 2000);

    await fn_Data_Write(LAMP_DC2_TAG, true); // đèn DC2 sáng
    await fn_tagRead();
  });

  socket.on("m_stop_dc2", async () => {
    if (!isManual) {
      console.log("Bỏ qua STOP DC2 vì chưa ở MANUAL");
      return;
    }
    await logEvent("STOP DC2 (Manual)");
    await pulseTag(MANUAL_STOP_DC2, 2000);

    await fn_Data_Write(LAMP_DC2_TAG, false); // đèn DC2 tắt
    await fn_tagRead();
  });

  // ==== RESET SYSTEM ====  (tất cả về 0 + xung SS_FAULT)
  socket.on("reset_system", async () => {
    await logEvent("RESET SYSTEM (tất cả tag về 0)");

    await resetAllTags();
    await pulseTag(RESET_SYSTEM, 2000);
    await fn_tagRead();
  });

  // ==== RESET DC1 ====
  socket.on("reset_dc1", async () => {
    await logEvent("RESET DC1");
    await pulseTag(RESET_DC1, 2000);

    await fn_Data_Write(LAMP_DC1_TAG, false);
    await fn_tagRead();
  });

  // ==== RESET DC2 ====
  socket.on("reset_dc2", async () => {
    await logEvent("RESET DC2");
    await pulseTag(RESET_DC2, 2000);

    await fn_Data_Write(LAMP_DC2_TAG, false);
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
});
