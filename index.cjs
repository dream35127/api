const express = require('express');
const { createConnection } = require('mysql');
const cors = require('cors');
const speakeasy = require('speakeasy');
const moment = require('moment-timezone');
const axios = require('axios');
const { config } = require('dotenv');;
config({ path: `${__dirname}/.env` });
const app = express();
const postmark = require('postmark');
const client = new postmark.ServerClient(process.env.TOKEN_EMAIL);
app.use(express.json()); 
app.use(cors());

const db = createConnection({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
});


app.get('/api/data', (req, res) => {
  const sql = 'SELECT * FROM tqf';
  db.query(sql, (err, result) => {
    if (err) {
      console.error('Error querying MySQL:', err);
      res.status(500).json({ error: 'Error querying MySQL' });
      return;
    }
    res.json(result);
  });
});
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL Database!');
});
app.post("/project", (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  db.query("SELECT * FROM login WHERE email = ? AND password = ? ",
    [email, password],
    (err, result) => {
      if (err) {
        res.send({ err: err });
      }
      if (result.length > 0) {
        res.send(result);
      }
      else {
        res.send({ message: "id/pass ไม่ถูกต้อง" });
      }
    });
});



app.get('/api/getTemplate', (req, res) => {
  const idTQF = req.query.idTQF; // รับชื่อเทมเพลตจากคำขอ
  const query = `SELECT template_file FROM template WHERE id_TQF = ?`;
  db.query(query, [idTQF], (error, results) => {
    if (error) {
      console.error('Error fetching template from database:', error);
      res.status(500).json({ message: 'Error fetching template from database' });
    } else {

      const templateFile = results[0].template_file;
      res.setHeader('Content-Disposition', `attachment; filename="template.docx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(templateFile);
    }
  });
});
app.post('/api/updateStatusTQF', (req, res) => {
  const courseCode = req.body.courseCode; // รับ courseCode จากคำขอ POST
  const query = `UPDATE tqf SET status_tqf = NOW() WHERE course_code = ?`;

  // Query อัพเดตค่า status_tqf
  db.query(query, [courseCode], (error, results) => {
    if (error) {
      console.error('Error updating status_tqf:', error);
      res.status(500).json({ message: 'Error updating status_tqf' });
    } else {
      console.log('status_tqf updated successfully');
      res.status(200).json({ message: 'status_tqf updated successfully' });
    }
  });
});


app.post('/api/update-data', (req, res) => {
  const { id_TQF } = req.body;

  const query = 'UPDATE tqf SET status_tqf = NOW() WHERE id_TQF = ?';

  db.query(query, [id_TQF], (error, results) => {
    if (error) {
      console.error('Error updating data:', error);
      res.status(500).send('Error updating data');
    } else {
      console.log('Data updated successfully');
      res.status(200).send('Data updated successfully');
    }
  });
});
app.post('/api/reset-date', (req, res) => {

  const query = 'UPDATE tqf SET status_tqf = NULL';

  db.query(query, (error, results) => {
    if (error) {
      console.error('Error updating data:', error);
      res.status(500).send('Error updating data');
    } else {
      console.log('Data updated successfully');
      res.status(200).send('Data updated successfully');
    }
  });
});


const userSecrets = [];
app.post('/generate-otp', (req, res) => {
  // สร้าง OTP
  userSecrets[req.body.email] = speakeasy.generateSecret();
  const otp = speakeasy.totp({
    secret: userSecrets[req.body.email].base32,
    step: 60,
  });

  // ข้อความอีเมล
  const mailOptions = {
    from: 's62122519001@ssru.ac.th', // อีเมลของคุณ
    to: req.body.email, // อีเมลผู้รับ
    subject: 'การยืนยันตัวตนในระบบประกันคุณภาพ', // หัวข้ออีเมล
    textBody: `เราขอยืนยันตัวตนของคุณในระบบประกันคุณภาพด้วยรหัส OTP ดังนี้: ${otp}\nกรุณาใส่รหัส OTP นี้ในแอปพลิเคชันของคุณเพื่อยืนยันตัวตน\n\nขอแสดงความนับถือ\nทีมงานระบบประกันคุณภาพ`, // เนื้อหาข้อความ
  };

  // ส่งอีเมล
  client.sendEmail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email: ', error);
      res.status(500).json({ message: 'Error sending OTP email' });
    } else {
      console.log('Email sent: ', info.response);
      res.json({ message: 'OTP sent successfully' });
    }
  });
});

app.post('/verify', (req, res) => {
  const verified = speakeasy.totp.verify({
    secret: userSecrets[req.body.email].base32,
    token: req.body.otp,
    step: 60, // ต้องตรงกับค่า step ที่ใช้ในการสร้าง OTP
  });
  if (verified) {
    // ค่า OTP ถูกต้อง
    res.json({ message: 'OTP ถูกต้อง' });
  } else {
    // ค่า OTP ไม่ถูกต้อง
    res.status(400).json({ message: 'OTP ไม่ถูกต้อง' });
  }
});

app.post('/reset-otp', (req, res) => {
  const secret = speakeasy.generateSecret();
  userSecrets[req.body.email] = secret;

  const otp = speakeasy.totp({
    secret: secret.base32,
    step: 60,
  });

  const mailOptions = {
    from: 'ระบบประกันคุณภาพ <ssru-engineer@hotmail.com>', // อีเมลของคุณ
    to: req.body.email, // อีเมลผู้รับ
    subject: 'การยืนยันตัวตนในระบบประกันคุณภาพ', // หัวข้ออีเมล
    textBody: `สวัสดีคุณ ${req.body.email},\n\nเราขอยืนยันตัวตนของคุณในระบบประกันคุณภาพด้วยรหัส OTP ดังนี้: ${otp}\nกรุณาใส่รหัส OTP นี้ในแอปพลิเคชันของคุณเพื่อยืนยันตัวตน\n\nขอแสดงความนับถือ,\nทีมงานระบบประกันคุณภาพ`, // เนื้อหาข้อความ
  };

  client.sendEmail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email: ', error);
      res.status(500).json({ message: 'Error sending OTP email' });
    } else {
      console.log('Email sent: ', info.response);
      res.json({ message: 'OTP reset successfully' });
    }
  });
});
app.delete('/delete-secret/:email', (req, res) => {
  const userEmailToRetrieve = req.params.email;

  if (userSecrets[userEmailToRetrieve]) {
    // ลบข้อมูลเครื่องมือ OTP ของผู้ใช้
    delete userSecrets[userEmailToRetrieve];
    res.status(200).json({ message: 'Deleted user OTP secret successfully' });
  } else {
    // ไม่พบข้อมูลเครื่องมือ OTP ของผู้ใช้
    res.status(404).json({ message: 'User OTP secret not found' });
  }
});
app.post('/delete-otp', (req, res) => {
  delete userSecrets[userEmailToRetrieve];
});
app.post('/line', (req, res) => {
  const formattedDate = moment.tz(req.body.dateTQF, 'Asia/Bangkok');
  const currentDate = moment();
  formattedDate.startOf('day'); // เริ่มเวลาที่ 00:00:00
  currentDate.startOf('day');  // เริ่มเวลาที่ 00:00:00
  const deadline = formattedDate.format('YYYY-MM-DD');
  console.log(formattedDate)
  console.log(currentDate)
  const timestamp = formattedDate - currentDate;
  console.log(timestamp)
    if (timestamp < 86400000) {
      res.status(200).json({ success: 'อัพเดตวันที่สำเร็จ' });
      setTimeout(() => {
        const token = process.env.TOKEN;
        const message = `\nไกล้ครบกำหนดวันที่  ${deadline}\nอย่าลืมส่งเอกสารมคอ.นะครับ!`;
        const url = 'https://notify-api.line.me/api/notify';
        const data = {
          message: message
        };
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        };
        axios.post(url, new URLSearchParams(data), { headers })
          .then(response => {
            console.log('ส่งข้อความสำเร็จ!');
          })
          .catch(error => {
            console.error('เกิดข้อผิดพลาดในการส่งข้อความ:', error);
          });
      }, timestamp); 
    }
});
app.listen(3001, () => {
  console.log("Yey, your server is running on port 3001");
});
module.exports = app;



