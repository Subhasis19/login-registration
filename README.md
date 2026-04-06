# Correspondence Management System

A simple web application to manage office correspondence in one place.

This system helps staff:

- record incoming letters and documents (`Inward`)
- record outgoing letters and replies (`Outward`)
- track pending replies
- enter monthly notings and email statistics
- generate Rajbhasha monthly reports
- manage users and import data in Excel format



## 1. What This Project Uses

| Part | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL |
| Authentication | Session-based login |
| Email OTP | Nodemailer (SMTP email) |
| Excel Import | XLSX + Multer |
| PDF Report | Puppeteer |

## 2. What You Need Before You Start

Please make sure you have these things installed:

| Requirement | Why It Is Needed |
|---|---|
| Node.js 18 or later | To run the application |
| MySQL 8.0 or later | To store all system data |
| A web browser | To open and use the system |
| An email account with SMTP details | To send OTP for registration and password reset |

Recommended:

- Node.js 20 LTS
- MySQL Workbench or any MySQL client

## 3. Important Words Used in This System

| Word | Meaning |
|---|---|
| Inward | A letter or document received by the office |
| Outward | A letter or reply sent by the office |
| Notings | Monthly count of file/document notes |
| Emails | Monthly count of received or replied emails |
| Admin | A user with extra permissions like user management, reports, and imports |

## 4. Quick Setup Overview

You will do these steps:

1. Open the project folder
2. Install project packages
3. Create the MySQL database
4. Create the required tables
5. Create the `.env` settings file
6. Start the application
7. Open the website in your browser

## 5. Step-by-Step Setup Guide

### Step 1: Open the Project Folder

Open PowerShell or Command Prompt inside this folder:

```powershell
cd Correspondence_Management_System
```

### Step 2: Install Project Packages

Run:

```powershell
npm install
```

This downloads everything the system needs to run.

### Step 3: Create the Database

Open MySQL and run:

```sql
CREATE DATABASE IF NOT EXISTS correspondence_management_system;
USE correspondence_management_system;
```

You can use a different database name if you want, but then you must use the same name in the `.env` file later.

### Step 4: Create the Required Tables

Copy and run the SQL below inside MySQL.

```sql
USE correspondence_management_system;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  mobile VARCHAR(15),
  password VARCHAR(255),
  role ENUM('user', 'admin') DEFAULT 'user',
  group_name VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS inward_records (
  s_no INT AUTO_INCREMENT PRIMARY KEY,
  date_of_receipt DATE NOT NULL,
  inward_no VARCHAR(50) NOT NULL UNIQUE,
  month VARCHAR(20),
  year INT,
  received_in ENUM('Silchar','Guwahati'),
  name_of_sender VARCHAR(100),
  address_of_sender VARCHAR(255),
  sender_city VARCHAR(100),
  sender_state VARCHAR(100),
  sender_pin VARCHAR(6),
  sender_region ENUM('A','B','C'),
  sender_org_type ENUM('Central','State','Private','Individual'),
  type_of_document VARCHAR(100),
  language_of_document ENUM('English','Hindi','Bilingual'),
  count INT DEFAULT 1,
  remarks ENUM('Action','Information'),
  issued_to VARCHAR(100),
  reply_required ENUM('Yes','No'),
  reply_sent_date DATE,
  reply_ref_no VARCHAR(100),
  reply_sent_by ENUM('Speed Post','Email'),
  reply_sent_in ENUM('English','Hindi','Bilingual'),
  reply_count INT DEFAULT 0,
  group_name VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inward_group ON inward_records(group_name);

CREATE TABLE IF NOT EXISTS outward_records (
  s_no INT AUTO_INCREMENT PRIMARY KEY,
  date_of_despatch DATE NOT NULL,
  outward_no VARCHAR(50) NOT NULL UNIQUE,
  month VARCHAR(20),
  year INT,
  reply_from ENUM('Silchar','Guwahati'),
  name_of_receiver VARCHAR(100),
  address_of_receiver VARCHAR(255),
  receiver_city VARCHAR(100),
  receiver_state VARCHAR(100),
  receiver_pin VARCHAR(6),
  receiver_region ENUM('A','B','C'),
  receiver_org_type ENUM('Central','State','Private','Individual'),
  type_of_document VARCHAR(100),
  language_of_document ENUM('English','Hindi','Bilingual'),
  count INT DEFAULT 1,
  inward_no VARCHAR(100),
  inward_s_no INT,
  reply_issued_by VARCHAR(100),
  reply_sent_date DATE,
  reply_ref_no VARCHAR(100),
  reply_sent_by ENUM('Speed Post','Email'),
  reply_sent_in ENUM('English','Hindi','Bilingual'),
  reply_count INT DEFAULT 0,
  group_name VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_inward_s_no (inward_s_no),
  KEY idx_outward_group (group_name),
  CONSTRAINT fk_outward_inward
    FOREIGN KEY (inward_s_no)
    REFERENCES inward_records(s_no)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS notings_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month TINYINT NOT NULL,
  year SMALLINT NOT NULL,
  entry_type ENUM('Noting','Comment') NOT NULL,
  notings_hindi_pages INT UNSIGNED DEFAULT 0,
  notings_english_pages INT UNSIGNED DEFAULT 0,
  eoffice_comments INT UNSIGNED DEFAULT 0,
  group_name VARCHAR(50),
  status ENUM('pending', 'confirmed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notings_group (group_name, month, year)
);

CREATE INDEX idx_notings_group ON notings_records(group_name);

CREATE TABLE IF NOT EXISTS email_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(50),
  month TINYINT NOT NULL,
  year SMALLINT NOT NULL,
  entry_type ENUM('Received','Replied') NOT NULL,
  region ENUM('A','B','C') NOT NULL,
  total_english INT UNSIGNED NOT NULL DEFAULT 0,
  total_hindi INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending', 'confirmed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_group (group_name, month, year, entry_type, region)
);
```

### Step 5: Create the `.env` File

In the project root, create a file named `.env`.

Paste this inside it:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=correspondence_management_system

SESSION_SECRET=change_this_to_a_long_random_secret

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password
```

Important:

- `DB_PASSWORD` should be your MySQL password
- `DB_NAME` must match the database you created
- `EMAIL_USER` and `EMAIL_PASS` are needed for OTP emails
- if you use Gmail, use an App Password, not your normal Gmail password

If email settings are missing, these features will not work:

- registration OTP
- forgot password OTP

### Step 6: Start the Application

Run:

```powershell
npm start
```

If everything is correct, you should see a message similar to:

```text
Server running on http://localhost:3000
```

### Step 7: Open the System in Your Browser

Open:

[http://localhost:3000](http://localhost:3000)

Useful pages:

| Page | URL |
|---|---|
| Login | `http://localhost:3000/` |
| Register/ New User | `http://localhost:3000/register.html` |
| Forgot Password | `http://localhost:3000/forgot.html` |


## 6. How to Create the First Admin User

By default, new registrations are created as normal users.

If you want someone to use the Admin Panel, do this:

1. Start the application
2. Register one user from the registration page
3. Open MySQL and run this query

```sql
UPDATE users
SET role = 'admin'
WHERE email = 'your_email@example.com';
```

4. Log out and log in again

After that, the Admin Panel will be visible for that user.

## 7. What the Admin Can Do

An admin user can:

- add, edit, and delete users
- search inward and outward records
- edit inward and outward entries
- confirm notings and email submissions
- import inward and outward data from Excel
- generate monthly Rajbhasha reports
- download reports as PDF

## 8. Excel Import Notes

The system supports Excel import for:

- inward records
- outward records

Before importing:

- upload the file
- preview the data
- validate the file
- then confirm import

If the file has wrong column names or duplicate values, the system will show the problem before importing.

## 9. Project structure (important files)And  Project Folders You Should Keep

```
project-root/
│── frontend/                     # Frontend static files
│   ├── css/                     # Stylesheets
│   │   ├── admin-style.css
│   │   ├── form.css
│   │   ├── report.css
│   │   └── style.css
│   │
│   ├── js/                      # Frontend JavaScript files
│   │
│   ├── dashboard.html           # Dashboard page
│   ├── forgot.html              # Forgot password page
│   ├── index.html               # Login/Home page
│   └── register.html            # Registration page
│
│── middlewares/                 # Custom middleware
│   └── authMiddleware.js        # Authentication middleware
│
│── routes/                      # API route handlers
│   ├── admin.js
│   ├── auth.js
│   ├── dashboard.js
│   ├── emails.js
│   ├── import.js
│   ├── inward.js
│   ├── notings.js
│   └── outward.js
│
│── services/                    # Business logic/services
│   └── report-calculator.js
│
│── utils/                       # Utility/helper functions
│   └── date-range.js
│
│── uploads/                     # Uploaded files storage
│
│── views/                       # Server-side views
│   └── forms/
│       ├── inward.html
│       └── outward.html
│
│── node_modules/                # Dependencies (auto-generated)
│
│── .env                         # Environment variables
│── .env.example                 # Example env file
│── .gitattributes
│── .gitignore
│
│── admin-setup.js               # Admin initialization script
│── db.js                        # Database connection setup
│── server.js                    # Main server entry point
│
│── package.json                 # Project metadata & dependencies
│── package-lock.json
│── README.md                   # Project documentation
```

These folders are used by the system and should not be deleted:

- `frontend`
- `routes`
- `views`
- `uploads/excel/inward`
- `uploads/excel/outward`

If the upload folders are missing, create them again before using Excel import.

## 10. Common Problems and Simple Fixes

| Problem | Simple Fix |
|---|---|
| App does not start | Make sure Node.js is installed and run `npm install` first |
| Database connection failed | Check MySQL is running and your `.env` DB values are correct |
| OTP email is not coming | Check email settings, spam folder, and App Password |
| Admin Panel is not visible | Make sure the user role is set to `admin`, then log in again |
| Login works but registration does not | OTP email settings are probably missing or incorrect |
| PDF is not downloading | Check Puppeteer/Chrome dependencies on your system |
| Excel import fails | Check column names and required values in the Excel file |



## 11. Final Notes

This project is a local web application built for correspondence and Rajbhasha reporting work.

For smooth use:

- keep MySQL running
- keep your `.env` file correct
- keep at least one admin user in the system
- do not delete the upload folders


