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
const multer = require('multer');
app.use(express.json());
app.use(cors({
  origin: 'https://ce-tqf-beta.vercel.app'
}));

const db = createConnection({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
});
const storage = multer.memoryStorage(); // ให้ Multer เก็บไฟล์ใน memory
const upload = multer({ storage: storage });

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
      res.setHeader('Content-Disposition', `inline; filename="template.docx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(templateFile);
    }
  });
});

app.post('/api/updateStatusTQF', (req, res) => {
  const courseCode = req.body.courseCode;
  const number_tqf = req.body.number_tqf;
  const query = `UPDATE tqf SET status_tqf = NOW() WHERE course_code = ? AND number_tqf = ?`;

  // Query อัพเดตค่า status_tqf
  db.query(query, [courseCode, number_tqf], (error, results) => {
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
    from: 's62122519001@ssru.ac.th', // อีเมลของคุณ
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
  formattedDate.startOf('day'); // เริ่มเวลาที่ 00:00:00
  const deadline = formattedDate.format('DD-MM-YYYY');
  console.log(formattedDate)
  const token = process.env.TOKEN;
  const message = `\nครบกำหนดส่งวันที่  ${deadline}\nอย่าลืมส่งเอกสารมคอ.นะครับ!`;
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
      console.log('success!');
      res.status(200).json({ success: 'อัพเดตวันที่สำเร็จ' });
    })
    .catch(error => {
      console.error('error:', error);
    });
});

app.post('/nofity-email', (req, res) => {
  const formattedDate = moment.tz(req.body.dateTQF, 'Asia/Bangkok');
  formattedDate.startOf('day'); // เริ่มเวลาที่ 00:00:00
  const deadline = formattedDate.format('DD-MM-YYYY');
  // ข้อความอีเมล
  const mailOptions = {
    from: 's62122519001@ssru.ac.th', // อีเมลของคุณ
    to: req.body.data2, // อีเมลผู้รับ
    subject: 'การแจ้งเตือนในระบบประกันคุณภาพ', // หัวข้ออีเมล
    textBody: `ครบกำหนดส่งวันที่  ${deadline}\nอย่าลืมส่งเอกสารมคอ.นะครับ!`, // เนื้อหาข้อความ
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
app.post('/api/input-USER', (req, res) => {
  const email = req.body.mail;
  const password = req.body.pass;
  const sql = 'INSERT INTO login (email, password) VALUES (?, ?)';
  db.query(sql, [email, password], (err, result) => {
    if (err) {
      console.error('MySQL Insert Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.status(201).json({ message: 'User inserted successfully', userId: result.insertId });
    }
  });
});
app.post('/upload/45Sfcc78SF-p77Zxc', upload.single('docxFile'), (req, res) => {
  const file_name = req.file.buffer; // ข้อมูลไฟล์ในรูปแบบ binary
  const id_TQF = req.body.id_TQF;
  const upload_status = 'อัพโหลดแล้ว';
  // ทำการบันทึก file ลงใน MySQL
  const query1 = 'INSERT INTO tqf (id_TQF,file_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE file_name = VALUES(file_name);';
  const sql1 = 'UPDATE tqf SET upload_status = ? WHERE id_TQF = ?';
  db.query(sql1, [upload_status, id_TQF], (err, result) => {
    if (err) {
      console.error('Error inserting file into database:', err);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    db.query(query1, [id_TQF, file_name], (err, result) => {
      if (err) {
        console.error('Error inserting file into database:', err);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }

      res.json({ message: 'File uploaded successfully!' });
    });
  });
});
app.post('/reset_file/45514AcxzOiuT-4778', (req, res) => {
  const id_TQF = req.body.id_TQF;
  const upload_status = 'ยังไม่อัพโหลด';
  const sql = 'UPDATE tqf SET file_name = NULL WHERE id_TQF = ?';
  const sql1 = 'UPDATE tqf SET upload_status = ? WHERE id_TQF = ?';

  // ทำการ Update ข้อมูล
  db.query(sql1, [upload_status, id_TQF], (err, result) => {
    if (err) {
      console.error('Error updating upload status in database:', err);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // หาก Update สำเร็จ จะทำการ Update file_name และส่ง response กลับไปที่ client
    db.query(sql, [id_TQF], (err, result) => {
      if (err) {
        console.error('Error updating file_name in database:', err);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }

      res.json({ message: 'File reset successfully!' });
    });
  });
});
app.get('/api/getTQF', (req, res) => {
  const id_TQF = req.query.idTQF;
  const queryUploadStatus = 'SELECT upload_status FROM tqf WHERE id_TQF = ?';
  const queryFile = 'SELECT file_name FROM tqf WHERE id_TQF = ?';

  db.query(queryUploadStatus, [id_TQF], (err, resultUploadStatus) => {
    if (err) {
      console.error('Error in database:', err);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    } else {
      const uploadStatus = resultUploadStatus[0].upload_status;

      // Check if upload_status meets your condition
      if (uploadStatus !== 'ยังไม่อัพโหลด') {
        // Continue with the second query to get file_name
        db.query(queryFile, [id_TQF], (error, results) => {
          if (error) {
            console.error('Error fetching template from database:', error);
            res.status(500).json({ message: 'Error fetching template from database' });
          } else {
            const templateFile = results[0].file_name;
            res.setHeader('Content-Disposition', `attachment; filename="template.docx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.send(templateFile);
          }
        });
      } else {
        // If upload_status doesn't meet the condition, send a response accordingly
        res.status(403).json({ message: 'Access denied. Upload status does not match the required condition.' });
      }
    }
  });
});
app.post('/api/delete-USER/485Az44A-874cvB', (req, res) => {
  const emailToDelete = req.body.deletemail;
  const sqlDelete = 'DELETE FROM login WHERE email = ?';

  db.query(sqlDelete, [emailToDelete], (err, result) => {
    if (err) {
      console.error('MySQL Delete Error:', err);
      res.status(500).json({ error: 'ข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    } else {
      if (result.affectedRows > 0) {
        res.status(200).json({ message: 'ลบผู้ใช้เรียบร้อยแล้ว' });
      } else {
        res.status(404).json({ error: 'ไม่พบผู้ใช้' });
      }
    }
  });
});
app.post('/notify-email1', async (req, res) => {
  try {
    // ถ้าคุณได้เชื่อมต่อ MySQL แล้ว และ 'connection' เป็นอ็อบเจ็กต์การเชื่อมต่อ MySQL
    const queryResult = await new Promise((resolve, reject) => {
      const query = 'SELECT email FROM login'; // แทนที่ 'your_table_name' ด้วยชื่อตารางจริง
      db.query(query, (error, results) => {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      });
    });

    // วนลูปผลลัพธ์และส่งอีเมล
    for (const result of queryResult) {
      const formattedDate = moment.tz(req.body.dateTQF, 'Asia/Bangkok');
      formattedDate.startOf('day');
      const deadline = formattedDate.format('DD-MM-YYYY');

      const mailOptions = {
        from: 's62122519001@ssru.ac.th',
        to: result.email, // ใช้ที่อยู่อีเมลจากฐานข้อมูล
        subject: 'การแจ้งเตือนในระบบประกันคุณภาพ',
        textBody: `ครบกำหนดส่งวันที่ ${deadline}\nอย่าลืมส่งเอกสารมคอ.นะครับ!`,
      };

      // ส่งอีเมล
      await new Promise((resolve, reject) => {
        client.sendEmail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending email: ', error);
            reject(error);
          } else {
            console.log('Email sent: ', info.response);
            resolve();
          }
        });
      });
    }

    res.json({ message: 'ส่งอีเมลเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งอีเมล' });
  }
});
app.listen(3001, () => {
  console.log("Yey, your server is running on port 3001");
});
module.exports = app;



