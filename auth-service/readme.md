MediSync Auth Service Documentation

Auth MicroserviceThis service handles User Authentication and Authorization for the MediSync platform.
Port ConfigurationService Port: 5001 
Database: MongoDB (via Mongoose).

 Features
Registration: Supports "Patient" and "Admin" roles using Radio Buttons.
Security: Password hashing with bcryptjs and session management via JWT.
Role-Based Access: Restricts sensitive routes based on user type.

 API Endpoints
POST/api/auth/register : Creates a new user with a specific role.
POST/api/auth/login : Returns a JWT token and user role.

 Setup 
npm install
Create a .env file with MONGO_URI and JWT_SECRET
npm start