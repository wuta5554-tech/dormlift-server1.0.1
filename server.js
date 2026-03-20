{
  "name": "dormlift-nz-v8-production",
  "version": "8.0.0",
  "description": "Student-to-student moving marketplace for University of Auckland",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cloudinary": "^1.36.4",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "multer-storage-cloudinary": "^4.0.0",
    "nodemailer": "^6.9.13",
    "pg": "^8.11.5"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
