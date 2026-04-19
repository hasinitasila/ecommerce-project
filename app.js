const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const session = require('express-session'); 
const path = require('path');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

app.use(session({
    secret: process.env.SESSION_SECRET, 
    resave: false,                       
    saveUninitialized: false,            
    cookie: {
        httpOnly: true,   
        maxAge: 1000 * 60 * 60 * 24, 
    }
}));

// --- Database ---
const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    : new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
    });

// --- Helpers ---
async function getUserId(username) {
    const result = await pool.query('SELECT user_id FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return null;
    return result.rows[0].user_id;
}

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'You must be logged in.' });
    }
    next();
}

// --- Page Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Auth Routes ---

// Register
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    if (username.length < 3) {
        return res.status(400).json({ success: false, error: 'Username must be at least 3 characters.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    try {
        const checkUserQuery = 'SELECT * FROM users WHERE username = $1 OR email = $2';
        const checkResult = await pool.query(checkUserQuery, [username, email]);

        if (checkResult.rows.length > 0) {
            const existing = checkResult.rows[0];
            if (existing.username === username) {
                return res.status(409).json({ success: false, error: 'Username already taken.' });
            }
            if (existing.email === email) {
                return res.status(409).json({ success: false, error: 'An account with that email already exists.' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const query = `
            INSERT INTO users (username, email, password)
            VALUES ($1, $2, $3)
            RETURNING user_id
        `;
        const result = await pool.query(query, [username, email, hashedPassword]);

        req.session.userId = result.rows[0].user_id;
        req.session.username = username;

        res.status(201).json({ success: true, message: 'Account created successfully.' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ success: false, error: 'Error registering user.' });
    }
});

// Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    try {
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await pool.query(query, [username]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }

        req.session.userId = user.user_id;
        req.session.username = user.username;

        res.json({ success: true, message: 'Login successful.' });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error.' });
    }
});

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Could not log out.' });
        }
        res.clearCookie('connect.sid'); 
        res.json({ success: true, message: 'Logged out.' });
    });
});

// Current user
app.get('/me', requireAuth, (req, res) => {
    res.json({ userId: req.session.userId, username: req.session.username });
});

// --- Product Routes ---

// Get all products (with optional search)
app.get('/products', requireAuth, async (req, res) => {
    try {
        const search = req.query.search;
        let query;
        let params = [];

        if (search && search.trim()) {
            query = `
                SELECT uniq_id, product_name, retail_price, discounted_price, image, description 
                FROM products
                WHERE product_name ILIKE $1 OR description ILIKE $1;
            `;
            params = ['%' + search.trim() + '%'];
        } else {
            query = `
                SELECT uniq_id, product_name, retail_price, discounted_price, image, description 
                FROM products;
            `;
        }

        const products = await pool.query(query, params);

        const formattedProducts = products.rows.map(product => {
            let imageArray = [];
            try {
                imageArray = JSON.parse(product.image || '[]');
            } catch (error) {
                // If image is not JSON, use it directly
                imageArray = product.image ? [product.image] : [];
            }

            const image = imageArray[0] || 'https://via.placeholder.com/300x220/1a1a2e/d4a853?text=No+Image';

            return {
                id: product.uniq_id,
                name: product.product_name,
                retailPrice: parseFloat(product.retail_price).toFixed(2),
                discountedPrice: parseFloat(product.discounted_price).toFixed(2),
                description: product.description,
                image: image,
            };
        });

        res.json(formattedProducts);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// --- Wishlist Routes ---

// Add to wishlist
app.post('/add-to-wishlist/:productId', requireAuth, async (req, res) => {
    const { productId } = req.params;
    const userId = req.session.userId;

    if (!productId) {
        return res.status(400).json({ success: false, error: 'Product ID is required.' });
    }

    try {
        const query = `
            INSERT INTO wishlist (username, uniq_id)
            VALUES ($1, $2)
            ON CONFLICT (username, uniq_id) DO NOTHING;
        `;
        await pool.query(query, [req.session.username, productId]);
        res.json({ success: true, message: 'Added to wishlist ♡' });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ success: false, error: 'Failed to add product to wishlist.' });
    }
});

// Get wishlist
app.get('/wishlist', requireAuth, async (req, res) => {
    const username = req.session.username;

    try {
        const query = `
            SELECT p.uniq_id, p.product_name, p.retail_price, p.discounted_price, p.image, p.description
            FROM products p
            JOIN wishlist w ON p.uniq_id = w.uniq_id
            WHERE w.username = $1;
        `;
        const result = await pool.query(query, [username]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch wishlist.' });
    }
});

// Remove from wishlist
app.delete('/wishlist/:productId', requireAuth, async (req, res) => {
    const { productId } = req.params;
    const username = req.session.username;

    try {
        await pool.query('DELETE FROM wishlist WHERE username = $1 AND uniq_id = $2', [username, productId]);
        res.json({ success: true, message: 'Removed from wishlist.' });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ success: false, error: 'Failed to remove from wishlist.' });
    }
});

// Move wishlist item to cart
app.post('/wishlist-to-cart/:productId', requireAuth, async (req, res) => {
    const { productId } = req.params;
    const username = req.session.username;

    try {
        // Add to cart
        await pool.query(`
            INSERT INTO cart (username, uniq_id, quantity)
            VALUES ($1, $2, 1)
            ON CONFLICT (username, uniq_id)
            DO UPDATE SET quantity = cart.quantity + 1;
        `, [username, productId]);

        // Remove from wishlist
        await pool.query('DELETE FROM wishlist WHERE username = $1 AND uniq_id = $2', [username, productId]);

        res.json({ success: true, message: 'Moved to cart! 🛒' });
    } catch (error) {
        console.error('Error moving to cart:', error);
        res.status(500).json({ success: false, error: 'Failed to move to cart.' });
    }
});

// --- Cart Routes ---

// Add to cart
app.post('/add-to-cart/:productId', requireAuth, async (req, res) => {
    const { productId } = req.params;
    const userId = req.session.userId;

    if (!productId) {
        return res.status(400).json({ success: false, error: 'Product ID is required.' });
    }

    try {
        const query = `
            INSERT INTO cart (username, uniq_id, quantity)
            VALUES ($1, $2, 1)
            ON CONFLICT (username, uniq_id)
            DO UPDATE SET quantity = cart.quantity + 1;
        `;
        await pool.query(query, [req.session.username, productId]);
        res.json({ success: true, message: 'Added to cart 🛒' });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ success: false, error: 'Failed to add product to cart.' });
    }
});

// Get cart
app.get('/cart', requireAuth, async (req, res) => {
    const username = req.session.username;

    try {
        const query = `
            SELECT p.uniq_id, p.product_name, p.retail_price, p.discounted_price, p.image, p.description, c.quantity
            FROM products p
            JOIN cart c ON p.uniq_id = c.uniq_id
            WHERE c.username = $1;
        `;
        const result = await pool.query(query, [username]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch cart.' });
    }
});

// Update cart quantity
app.patch('/cart/:productId', requireAuth, async (req, res) => {
    const { productId } = req.params;
    const { action } = req.body;
    const username = req.session.username;

    try {
        if (action === 'increment') {
            await pool.query(
                'UPDATE cart SET quantity = quantity + 1 WHERE username = $1 AND uniq_id = $2',
                [username, productId]
            );
        } else if (action === 'decrement') {
            // Get current quantity
            const result = await pool.query(
                'SELECT quantity FROM cart WHERE username = $1 AND uniq_id = $2',
                [username, productId]
            );
            if (result.rows.length > 0 && result.rows[0].quantity <= 1) {
                // Remove if quantity would become 0
                await pool.query(
                    'DELETE FROM cart WHERE username = $1 AND uniq_id = $2',
                    [username, productId]
                );
            } else {
                await pool.query(
                    'UPDATE cart SET quantity = quantity - 1 WHERE username = $1 AND uniq_id = $2',
                    [username, productId]
                );
            }
        } else {
            return res.status(400).json({ success: false, error: 'Invalid action. Use "increment" or "decrement".' });
        }

        res.json({ success: true, message: 'Cart updated.' });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ success: false, error: 'Failed to update cart.' });
    }
});

// Remove from cart
app.delete('/cart/:productId', requireAuth, async (req, res) => {
    const { productId } = req.params;
    const username = req.session.username;

    try {
        await pool.query('DELETE FROM cart WHERE username = $1 AND uniq_id = $2', [username, productId]);
        res.json({ success: true, message: 'Item removed from cart.' });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({ success: false, error: 'Failed to remove from cart.' });
    }
});

// --- Order Routes ---

// Place order (buy now)
app.post('/buy-now', requireAuth, async (req, res) => {
    const username = req.session.username;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const orderQuery = 'INSERT INTO orders (username, total_amount) VALUES ($1, 0) RETURNING order_id';
        const orderResult = await client.query(orderQuery, [username]);
        const orderId = orderResult.rows[0].order_id;

        const cartQuery = `
            SELECT c.uniq_id, c.quantity, p.discounted_price
            FROM cart c
            JOIN products p ON c.uniq_id = p.uniq_id
            WHERE c.username = $1;
        `;
        const cartResult = await client.query(cartQuery, [username]);

        if (cartResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Cart is empty.' });
        }

        let totalAmount = 0;
        for (const item of cartResult.rows) {
            const totalPrice = item.discounted_price * item.quantity;
            totalAmount += totalPrice;

            const orderItemQuery = `
                INSERT INTO order_items (order_id, uniq_id, quantity, price_per_unit, total_price)
                VALUES ($1, $2, $3, $4, $5);
            `;
            await client.query(orderItemQuery, [orderId, item.uniq_id, item.quantity, item.discounted_price, totalPrice]);
        }

        await client.query('UPDATE orders SET total_amount = $1 WHERE order_id = $2', [totalAmount, orderId]);
        await client.query('DELETE FROM cart WHERE username = $1', [username]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Order placed successfully! 🎉' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error placing order:', error);
        res.status(500).json({ success: false, error: 'Failed to place order.' });
    } finally {
        client.release();
    }
});

// Get order history
app.get('/orders', requireAuth, async (req, res) => {
    const username = req.session.username;

    try {
        const query = `
            SELECT o.order_id, o.total_amount, o.order_status, o.ordered_at,
                   json_agg(json_build_object(
                       'product_name', p.product_name,
                       'quantity', oi.quantity,
                       'price_per_unit', oi.price_per_unit,
                       'total_price', oi.total_price
                   )) as items
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN products p ON oi.uniq_id = p.uniq_id
            WHERE o.username = $1
            GROUP BY o.order_id
            ORDER BY o.ordered_at DESC;
        `;
        const result = await pool.query(query, [username]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch orders.' });
    }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'An unexpected error occurred.' });
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`KART server running at http://localhost:${port}`);
});