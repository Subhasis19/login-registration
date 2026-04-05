# Correspondence Management System

A lightweight correspondence management web app with user authentication, built with Node.js, Express and MySQL. The project provides simple forms for registering users and recording inward/outward correspondence entries.

This README explains how to set up the application locally, create the required database objects (including the `inward_records` table), and run the app for development.

Contents
- Overview
- Features
- Tech stack
- Prerequisites
- Quick start (clone, install, run)
- Database: schema & DDL (users + inward_records)
- Configuration (.env)
- Running the application
- Project structure
- API endpoints
- Development notes & tips
- Contributing
- License

---

## Overview

The application provides basic login/registration functionality and forms to capture inward and outward correspondence. It was built to be simple to run locally and easy to extend.

## Features

- User registration and login (passwords hashed using bcrypt)
- Session-based authentication (express-session)
- Inward and outward correspondence entry forms with client-side validation
- Server endpoints to insert and fetch inward records

## Tech stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: MySQL (mysql2 driver)
- Environment: dotenv for configuration

## Prerequisites

- Node.js (v14+)
- MySQL (v8.0+)
- Git (to clone the repo)

## Quick start - Local (development)

1. Clone the repository and enter the folder:

```pwsh
git clone https://github.com/Subhasis19/Correspondence_Management_System.git
cd Correspondence_Management_System
```

2. Install dependencies:

```pwsh
npm install
```

3. Create a database (example name: `Correspondence_Management_System`) and create a DB user (optional but recommended).

You can create the database from the MySQL client with:

```sql
CREATE DATABASE IF NOT EXISTS Correspondence_Management_System;
USE Correspondence_Management_System;
```

4. Create a `.env` file at the project root and provide DB connection values (see the Configuration section below).

5. Create the required tables (see Database section).

6. Start the server:

```pwsh
node server.js
```

7. Open the app in your browser:

- `http://localhost:3000/frontend/register.html` — Registration page
- `http://localhost:3000/frontend/index.html` — Login page

---

## Database: schema & DDL

The app uses a `users` table for authentication and an `inward_records` table for inward correspondence entries. Below are the DDL statements.

Users table :

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  mobile VARCHAR(15),
  password VARCHAR(255),
  role ENUM('user', 'admin') DEFAULT 'user',
  group_name VARCHAR(50)
);
```

Inward records table (copy / run exactly as shown):

```sql
CREATE TABLE inward_records (
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

  group_name VARCHAR(50) ,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inward_group ON inward_records(group_name);

```
Outward Records Table (WITH Foreign Key Link to Inward)
```sql
CREATE TABLE outward_records (
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

  group_name VARCHAR(50) ,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  KEY idx_inward_s_no (inward_s_no),
  KEY idx_outward_group (group_name),

  CONSTRAINT fk_outward_inward
    FOREIGN KEY (inward_s_no)
    REFERENCES inward_records(s_no)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

```
Notings Records
```sql
CREATE TABLE notings_records (
  id INT AUTO_INCREMENT PRIMARY KEY,

  month TINYINT NOT NULL,
  year SMALLINT NOT NULL,

  entry_type ENUM('Noting','Comment') NOT NULL,

  notings_hindi_pages INT UNSIGNED DEFAULT 0,
  notings_english_pages INT UNSIGNED DEFAULT 0,
  eoffice_comments INT UNSIGNED DEFAULT 0,

  group_name VARCHAR(50) ,
  
  status ENUM('pending', 'confirmed') DEFAULT 'pending',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_notings_group (
    group_name, month, year
  )
);

CREATE INDEX idx_notings_group ON notings_records(group_name);

```
Email Records
```sql
CREATE TABLE email_records (
  id INT AUTO_INCREMENT PRIMARY KEY,

  group_name VARCHAR(50) ,

  month TINYINT NOT NULL,
  year SMALLINT NOT NULL,

  entry_type ENUM('Received','Replied') NOT NULL,
  region ENUM('A','B','C') NOT NULL,

  total_english INT UNSIGNED NOT NULL DEFAULT 0,
  total_hindi   INT UNSIGNED NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_email_group (group_name, month, year, entry_type, region)
);

```
Recommended verification commands in MySQL client:

```sql
USE Correspondence_Management_System;
SHOW TABLES;
DESCRIBE inward_records;
```

Optional: save the DDL to `inward_records.sql` and import with the MySQL client:

```pwsh
mysql -u <user> -p login_system < inward_records.sql
```

---

## Configuration (.env)

Create a `.env` file in the project root with the following variables (example):

```
DB_HOST=localhost
DB_USER=appuser
DB_PASSWORD=strong_password
DB_NAME=login_system
```

The app reads these values in `db.js` and connects using the `mysql2` driver.

---

## Running the application

Start the server with:

```pwsh
node server.js
```

By default the server listens on `http://localhost:3000` (see `server.js`). Open the frontend pages directly via the paths under `/frontend` or through the Express static server.

---

## Project structure (important files)

```
Correspondence_Management_System/
├─ db.js             # Database connection (reads .env)
├─ server.js         # Express routes and server
├─ package.json
├─ README.md
└─ frontend/
   ├─ index.html     # Login
   ├─ register.html  # Registration
   ├─ inward.html    # Inward form
   ├─ outward.html   # Outward form
   ├─ form.css       # Styles for forms
   ├─ style.css
   └─ form-validation.js  # Client-side validation (inward/outward)
```

---

## API Endpoints (selected)

- `POST /register` — Register a new user (form in `frontend/register.html`)
- `POST /login` — Authenticate a user (form in `frontend/index.html`)
- `POST /inward/add` — Server route that inserts an inward record (used by `inward.html`)
- `GET /inward/all` — Returns a JSON list of inward records

Check `server.js` for the full set of routes and implementation details.

---

## Development notes & recommendations

- The project currently serves the `frontend/` folder as static assets (see `server.js`). Use `http://localhost:3000/frontend/<page>.html` to open pages through the server.
- The `form-validation.js` file contains client-side validation for both inward and outward forms. If you add other forms, consider extracting shared helpers to a small `form-utils.js` module.
- For production, use a process manager (PM2) and configure a reverse proxy (NGINX) if exposing the app publicly.

Troubleshooting tips
- If the server fails to connect to MySQL, verify `.env` values and confirm MySQL is running and accessible from the host.
- If a form fails to submit, open DevTools → Console and Network to inspect requests and server responses.
- For duplicate `inward_no` errors the code retries generation, but if you run into insert failures check server logs printed by `server.js`.

---


---
```
Upload Excel
↓
Preview
↓
Dry Run Validation
↓
Show error report
↓
Admin confirms
↓
Transaction Import
↓
Final Report
```