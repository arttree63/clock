const mongo = require("mongodb");
const uri = process.env.MONGO_URI;
//const uri = "mongodb+srv://arttree63:5kfG2aY29nJqUnpg@cluster0.axodi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new mongo.MongoClient(uri);
const taipeiTime = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
const moment = require("moment-timezone");

// 建立網站伺服器基礎設定
const express = require("express");
const app = express();

app.use(express.json()); // ✅ 解析 JSON
app.use(express.urlencoded({ extended: true })); // ✅ 解析表單資料

const session = require("express-session");

// ✅ 設定 Express session
app.use(session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,

}));



app.set("view engine", "ejs");
app.set("views", "./views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
//建立需要的路由
app.get("/" ,function(req, res){
 res.render("index.ejs");
});


let db; // 確保 db 變數可以在其他地方使用

async function initDB() {
    try {
        await client.connect();
        console.log("✅ MongoDB 連線成功");
        db = client.db("company_system"); // 初始化 db
    } catch (error) {
        console.error("❌ 無法連接到 MongoDB：", error);
        db = null; // 確保 db 在錯誤時不會被誤用
    }
}

// 啟動時先初始化資料庫
initDB();


app.get("/employees", async function (req, res) {
    if (!req.session.username) {
        res.redirect("/");
        return;
    }

    res.render("employees.ejs", { 
        name: req.session.name,
        role: req.session.role 
    });
});



//連線到 /error?msg=錯誤訊息
app.get("/error" ,function(req, res){
    const msg=req.query.msg;
    res.render("error.ejs",{msg:msg})
});

app.post("/signup", async function (req, res) {
    if (!db) { // 確保 db 不為 null
        return res.status(500).json({ success: false, message: "❌ 伺服器錯誤：資料庫未連接" });
    }

    try {
        const { name, username, password } = req.body;

        const collection = db.collection("employees"); // 🔥 這裡 db 現在已經正確初始化了！

        const existingUser = await collection.findOne({ username });
        if (existingUser) {
            return res.json({ success: false, message: "❌ 註冊失敗，帳號已存在" });
        }

        await collection.insertOne({ name, username, password });

        res.redirect("/");

    } catch (error) {
        console.error("❌ 註冊錯誤:", error);
        return res.status(500).json({ success: false, message: "❌ 伺服器錯誤，請稍後再試" });
    }
});

//登出會員功能路由
app.get("/signout", function (req, res) {
    req.session.destroy();  // ✅ 清除 session
    res.redirect("/");
});


app.post("/signin", async function (req, res) {
    if (!db) {
        res.status(500).send("資料庫尚未初始化");
        return;
    }

    const { username, password } = req.body;

    try {
        const collection = db.collection("employees");
        const result = await collection.findOne(
            { username },
            { projection: { name: 1, username: 1, password: 1, role: 1 } } // ✅ 確保查詢時取出 role
        );

        if (!result) {
            return res.redirect("/error?msg=登入失敗，帳號或密碼錯誤");
        }

        if (result.password === password) {
            req.session.username = result.username;
            req.session.name = result.name;
            req.session.role = result.role || "employee"; // ✅ 預設為 employee，若有 admin 則存 admin

            res.redirect("/employees");
        } else {
            res.redirect("/error?msg=登入失敗，帳號或密碼錯誤");
        }
    } catch (err) {
        console.error("資料庫錯誤:", err);
        res.status(500).send("伺服器錯誤，請稍後再試");
    }
});



app.post("/clock", async function (req, res) {
    if (!db) {
        return res.json({ success: false, message: "❌ 伺服器錯誤：資料庫未連接" });
    }

    const username = req.session.username;
    const { action } = req.body;

    if (!username) {
        return res.json({ success: false, message: "❌ 請先登入" });
    }
    if (!action) {
        return res.json({ success: false, message: "❌ 未提供打卡類型" });
    }

    try {
        const collection = db.collection("clock_in_out");

        // 取得當天日期（台北時間）
        const taipeiTime = moment().tz("Asia/Taipei").format("YYYY-MM-DD HH:mm:ss");
        const today = moment().tz("Asia/Taipei").format("YYYY-MM-DD");

        // 先查找當天的打卡記錄
        let record = await collection.findOne({ username, date: today });

        if (!record) {
            // 🚀 第一次打卡，新增一筆記錄
            record = {
                username,
                date: today,
                clock_in: action === "clock_in" ? taipeiTime : null,
                clock_out: action === "clock_out" ? taipeiTime : null,
                overtime_start: action === "overtime_start" ? taipeiTime : null,
                overtime_end: action === "overtime_end" ? taipeiTime : null
            };
            await collection.insertOne(record);
        } else {
            // 🚀 已經有記錄，更新對應的欄位
            const updateField = {};
            if (action === "clock_in") updateField.clock_in = taipeiTime;
            if (action === "clock_out") updateField.clock_out = taipeiTime;
            if (action === "overtime_start") updateField.overtime_start = taipeiTime;
            if (action === "overtime_end") updateField.overtime_end = taipeiTime;

            await collection.updateOne(
                { username, date: today },
                { $set: updateField }
            );
        }

        return res.json({ success: true, message: `✅ 成功 ${action}！` });

    } catch (error) {
        console.error("❌ 打卡錯誤:", error);
        return res.json({ success: false, message: "❌ 伺服器錯誤，請稍後再試" });
    }
});


app.get("/clock-records", async function (req, res) {
    const username = req.session.username;
    if (!username) {
        return res.json({ success: false, message: "❌ 請先登入" });
    }

    const collection = db.collection("clock_in_out");

    // 取得當天日期
    const today = moment().tz("Asia/Taipei").format("YYYY-MM-DD");

    // 查找當天的打卡記錄
    const record = await collection.findOne({ username, date: today });

    if (!record) {
        return res.json({
            success: true,
            clock_in: null,
            clock_out: null,
            overtime_start: null,
            overtime_end: null
        });
    }

    return res.json({
        success: true,
        clock_in: record.clock_in || null,
        clock_out: record.clock_out || null,
        overtime_start: record.overtime_start || null,
        overtime_end: record.overtime_end || null
    });
});



app.get("/admin", async function (req, res) {
    if (!req.session.username || req.session.role !== "admin") {
        return res.redirect("/");
    }

    const collection = db.collection("clock_in_out");

    // 取得當月的打卡記錄
    const startOfMonth = moment().tz("Asia/Taipei").startOf('month').format("YYYY-MM-DD");
    const today = moment().tz("Asia/Taipei").format("YYYY-MM-DD");

    const records = await collection.find({
        date: { $gte: startOfMonth, $lte: today }
    }).sort({ date: -1 }).toArray();

    // 按日期分組
    const groupedRecords = {};
    const monthlyStats = {}; // 員工當月總工時 & 加班時數

    records.forEach(record => {
        if (!groupedRecords[record.date]) {
            groupedRecords[record.date] = [];
        }
        groupedRecords[record.date].push({
            username: record.username,
            clock_in: record.clock_in || "未打卡",
            clock_out: record.clock_out || "未打卡",
            overtime_start: record.overtime_start || "未打卡",
            overtime_end: record.overtime_end || "未打卡",
            total_work_hours: calculateWorkHours(record),
            total_overtime_hours: calculateOvertimeHours(record)
        });

        // 📌 計算每位員工的「當月總工時」與「當月加班時數」
        if (!monthlyStats[record.username]) {
            monthlyStats[record.username] = { total_work: 0, total_overtime: 0 };
        }
        monthlyStats[record.username].total_work += calculateWorkHours(record);
        monthlyStats[record.username].total_overtime += calculateOvertimeHours(record);
    });

    res.render("admin.ejs", { groupedRecords, monthlyStats });
});

// ✅ 計算「當日工作時數」（無條件捨去）
function calculateWorkHours(record) {
    if (!record.clock_in || !record.clock_out) return 0;

    const start = moment(record.clock_in, "YYYY-MM-DD HH:mm:ss");
    const end = moment(record.clock_out, "YYYY-MM-DD HH:mm:ss");

    return Math.floor(end.diff(start, "hours")); // ✅ 無條件捨去
}

// ✅ 計算「當日加班時數」（無條件捨去）
function calculateOvertimeHours(record) {
    if (!record.overtime_start || !record.overtime_end) return 0;

    const start = moment(record.overtime_start, "YYYY-MM-DD HH:mm:ss");
    const end = moment(record.overtime_end, "YYYY-MM-DD HH:mm:ss");

    return Math.floor(end.diff(start, "hours")); // ✅ 無條件捨去
}





//http://localhost:3000/
//app.listen(3000, function() {
//    console.log("Server Started");
//});



const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log(`🚀 Server running on port ${PORT}`);
});
