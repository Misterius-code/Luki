-- MySQL Database Schema for syn-prezesa
-- Run this script to create the database and tables

CREATE DATABASE IF NOT EXISTS syn_prezesa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE syn_prezesa;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    createdAt DATETIME NOT NULL,
    lastActivity DATETIME,
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders table (stores JSON data for flexibility)
CREATE TABLE IF NOT EXISTS zamowienia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data JSON NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_numer_zlecenia ((CAST(data->>'$.Numer zlecenia' AS CHAR(255))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Archive table
CREATE TABLE IF NOT EXISTS zamowienia_archiwum (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data JSON NOT NULL,
    archivedAt DATETIME NOT NULL,
    createdAt DATETIME,
    INDEX idx_archived_at (archivedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Production plan table
CREATE TABLE IF NOT EXISTS plan_produkcji (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orderId VARCHAR(255) NOT NULL,
    numerZlecenia VARCHAR(255),
    destination VARCHAR(255),
    kind VARCHAR(255) NOT NULL,
    createdAt DATETIME,
    updatedAt DATETIME,
    UNIQUE KEY unique_order_kind (orderId, kind),
    INDEX idx_orderId (orderId),
    INDEX idx_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

