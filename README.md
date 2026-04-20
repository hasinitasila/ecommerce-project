# KART - E-Commerce Web Application

A full-stack e-commerce web application built with Node.js, Express, and PostgreSQL.

**🔗 Live Demo:** [https://ecommerce-project-316f.onrender.com](https://ecommerce-project-316f.onrender.com)

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Authentication:** Express-Session, bcrypt.js

## Features

- User registration and login with hashed passwords
- Browse and search products
- Add products to cart and wishlist
- Update cart item quantities
- Remove items from cart or wishlist
- Move items from wishlist to cart
- Place orders with order history tracking
- Responsive design with dark theme UI

## Project Structure

```
├── app.js               # Main server file and API routes
├── prod.js              # Database seeding script (loads products from Excel)
├── Database.sql         # Database schema
├── public/
│   ├── styles.css       # Shared design system
│   ├── index.html       # Landing page
│   ├── login.html       # Login page
│   ├── register.html    # Registration page
│   ├── products.html    # Products listing page
│   ├── cart.html        # Shopping cart page
│   └── wishlist.html    # Wishlist page
├── .env                 # Environment variables (not committed)
└── package.json
```

## Getting Started

### Prerequisites

- Node.js
- PostgreSQL

### Installation

1. Clone the repository

```bash
git clone https://github.com/hasinitasila/ecommerce-project.git
cd ecommerce-project
```

2. Install dependencies

```bash
npm install
```

3. Create a `.env` file in the root directory

```
DB_USER=your_postgres_username
DB_HOST=localhost
DB_NAME=your_database_name
DB_PASSWORD=your_password
DB_PORT=5432
SESSION_SECRET=your_secret_key
```

4. Set up the database by running the SQL schema

```bash
psql -U your_username -d your_database -f Database.sql
```

5. Start the server

```bash
npm start
```

6. Open your browser and go to `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /register | Register a new user |
| POST | /login | Login |
| POST | /logout | Logout |
| GET | /me | Get current session user |
| GET | /products | Get all products (supports ?search= query) |
| POST | /add-to-cart/:id | Add product to cart |
| GET | /cart | Get cart items |
| PATCH | /cart/:id | Update cart item quantity |
| DELETE | /cart/:id | Remove item from cart |
| POST | /add-to-wishlist/:id | Add product to wishlist |
| GET | /wishlist | Get wishlist items |
| DELETE | /wishlist/:id | Remove item from wishlist |
| POST | /wishlist-to-cart/:id | Move wishlist item to cart |
| POST | /buy-now | Place order from cart |
| GET | /orders | Get order history |
