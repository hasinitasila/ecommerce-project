const { Client } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

require('dotenv').config();

const client = process.env.DATABASE_URL
    ? new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'project',
        password: '1234',
        port: 5432,
    });

// Function to read Excel file and insert data into the products table
async function insertProductsFromExcel(filePath) {
    try {
        // Connect to PostgreSQL
        await client.connect();
        console.log('Connected to PostgreSQL database.');

        // Read Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Assuming data is in the first sheet
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log(`Inserting ${data.length} records into the products table.`);

        // Insert data into the products table
        for (const row of data) {
            const { uniq_id, product_name, retail_price, discounted_price, image, description } = row;

            // Use a parameterized query to prevent SQL injection
            const query = `
                INSERT INTO products (uniq_id, product_name, retail_price, discounted_price, image, description)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (uniq_id) DO NOTHING; -- Skip if uniq_id already exists
            `;

            await client.query(query, [
                uniq_id,
                product_name,
                retail_price,
                discounted_price,
                image,
                description,
            ]);
        }

        console.log('Data successfully inserted into the products table.');
    } catch (error) {
        console.error('Error inserting data:', error.message);
    } finally {
        // Disconnect from PostgreSQL
        await client.end();
        console.log('Disconnected from PostgreSQL database.');
    }
}

// Path to your Excel file
const filePath = path.join(__dirname, 'Ecommerce.xlsx');

// Call the function to insert data
insertProductsFromExcel(filePath);
