const puppeteer = require('puppeteer');
const fs = require('fs');
const csv = require('csv-writer').createObjectCsvWriter;

const csvWriter = csv({
    path: 'roofing_companies.csv',
    header: [
        {id: 'name', title: 'Company Name'},
        {id: 'phone', title: 'Phone'},
        {id: 'email', title: 'Email'},
        {id: 'website', title: 'Website'},
        {id: 'address', title: 'Address'}
    ]
});

async function scrapeYellowPages(pageNum = 1) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const companies = [];
    
    try {
        // Search Yellow Pages for roofing companies in Miami
        await page.goto(`https://www.yellowpages.com/search?search_terms=roofing+contractors&geo_location_terms=Miami%2C+FL&page=${pageNum}`);
        
        // Wait for results to load
        await page.waitForSelector('.search-results');
        
        // Extract company information
        const results = await page.evaluate(() => {
            const items = [];
            const listings = document.querySelectorAll('.search-results .result');
            
            listings.forEach(listing => {
                const nameEl = listing.querySelector('.business-name');
                const phoneEl = listing.querySelector('.phone');
                const websiteEl = listing.querySelector('.track-visit-website');
                const addressEl = listing.querySelector('.street-address');
                
                if (nameEl) {
                    items.push({
                        name: nameEl.innerText.trim(),
                        phone: phoneEl ? phoneEl.innerText.trim() : '',
                        website: websiteEl ? websiteEl.href : '',
                        address: addressEl ? addressEl.innerText.trim() : ''
                    });
                }
            });
            
            return items;
        });
        
        // For each company with a website, visit it to try to find email
        for (const company of results) {
            if (company.website) {
                try {
                    await page.goto(company.website, { waitUntil: 'networkidle0', timeout: 30000 });
                    
                    const email = await page.evaluate(() => {
                        const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
                        const pageText = document.body.innerText;
                        const matches = pageText.match(emailRegex);
                        return matches ? matches[0] : '';
                    });
                    
                    company.email = email;
                } catch (err) {
                    console.log(`Could not scrape email from ${company.website}: ${err.message}`);
                    company.email = '';
                }
            }
            companies.push(company);
        }
        
        // Save to CSV
        await csvWriter.writeRecords(companies);
        
    } catch (err) {
        console.error('Scraping error:', err);
    } finally {
        await browser.close();
    }
    
    return companies;
}

// Function to scrape Google Maps
async function scrapeGoogleMaps() {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const companies = [];
    
    try {
        await page.goto('https://www.google.com/maps');
        await page.type('#searchboxinput', 'roofing companies miami florida');
        await page.keyboard.press('Enter');
        
        // Wait for results to load
        await page.waitForSelector('[data-item-id]');
        
        // Extract company information
        const results = await page.evaluate(() => {
            const items = [];
            const listings = document.querySelectorAll('[data-item-id]');
            
            listings.forEach(listing => {
                const name = listing.querySelector('.fontHeadlineSmall')?.innerText;
                const phone = listing.querySelector('[data-tooltip="Copy phone number"]')?.innerText;
                const website = listing.querySelector('[data-tooltip="Open website"]')?.href;
                
                if (name) {
                    items.push({ name, phone, website });
                }
            });
            
            return items;
        });
        
        companies.push(...results);
        
    } catch (err) {
        console.error('Google Maps scraping error:', err);
    } finally {
        await browser.close();
    }
    
    return companies;
}

// Main function to run both scrapers
async function main() {
    const yellowPagesResults = await scrapeYellowPages();
    const googleMapsResults = await scrapeGoogleMaps();
    
    // Combine results and remove duplicates
    const allCompanies = [...yellowPagesResults, ...googleMapsResults];
    const uniqueCompanies = Array.from(new Set(allCompanies.map(c => c.name)))
        .map(name => allCompanies.find(c => c.name === name));
    
    // Save final results
    await csvWriter.writeRecords(uniqueCompanies);
    console.log(`Scraped ${uniqueCompanies.length} unique companies`);
}

main().catch(console.error);