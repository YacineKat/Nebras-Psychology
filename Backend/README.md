# Nebras Backend - MVP

A simple backend API for the Nebras mental health platform.

## Quick Start

### 1. Install Dependencies
```bash
cd nebras-backend
npm install
```

### 2. Configure Database
Edit `.env` file with your Supabase credentials:
```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
JWT_SECRET="your-secret-key"
PORT=3000
```

### 3. Run Migration
```bash
npx prisma migrate dev --name init
```

### 4. Start Server
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (requires token)
- `PUT /api/auth/profile` - Update profile (requires token)

### Doctors
- `GET /api/doctors` - List all doctors
- `GET /api/doctors/:id` - Get doctor details
- `GET /api/doctors/profile/me` - Get my profile (doctor only)
- `PUT /api/doctors/profile` - Update doctor profile
- `POST /api/doctors/schedule` - Add time slot
- `GET /api/doctors/schedule` - Get my schedule

### Appointments
- `POST /api/appointments` - Book appointment
- `GET /api/appointments` - Get my appointments
- `GET /api/appointments/:id` - Get appointment details
- `PUT /api/appointments/:id` - Update status (doctor only)
- `DELETE /api/appointments/:id` - Cancel appointment

### Messages
- `POST /api/messages` - Send message
- `GET /api/messages/conversations` - Get all conversations
- `GET /api/messages/with/:userId` - Get messages with user
- `GET /api/messages/unread` - Get unread count

## Testing with cURL

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456","fullname":"Test User","userType":"patient"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'

# Get Doctors (use token from login)
curl -X GET http://localhost:3000/api/doctors \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Project Structure

```
nebras-backend/
├── prisma/
│   └── schema.prisma      # Database schema
├── src/
│   ├── controllers/       # API logic
│   │   ├── authController.js
│   │   ├── doctorController.js
│   │   ├── appointmentController.js
│   │   └── messageController.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── routes/            # API routes
│   │   ├── authRoutes.js
│   │   ├── doctorRoutes.js
│   │   ├── appointmentRoutes.js
│   │   └── messageRoutes.js
│   └── index.js           # Server entry point
├── .env                   # Environment variables
├── package.json
└── README.md
```

## Notes

- All protected routes require JWT token in header: `Authorization: Bearer <token>`
- Doctors must be userType 'psychologue' or 'counselor'
- Appointments use time slots for availability checking
- Messages are between any two users

## Tech Stack

- Node.js + Express
- PostgreSQL (Supabase)
- Prisma ORM
- JWT for authentication
- bcryptjs for password hashing