const http = require('http');
const https = require('https');
const { URL } = require('url');
require('dotenv').config();

const allowedOrigins = [
    'https://dev.teus-group.com',
    'https://teus-group.com'
];

// Create a server to handle incoming requests
const server = http.createServer((request, response) => {
    // Set CORS headers
    const origin = request.headers.origin;

    // Log the incoming request details
    // console.log(`Incoming Request: ${request.url}`);
    // console.log(`Origin: ${origin}`);
    // console.log(`Method: ${request.method}`);
    // console.log(`URL: ${request.url}`);

    if (allowedOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
    }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle OPTIONS method (for CORS preflight requests)
    if (request.method === 'OPTIONS') {
        response.writeHead(204); // No Content
        response.end();
        return;
    }

    if (request.method === 'POST' && request.url.startsWith('/api/hubspot')) {
        handleHubspotRequest(request, response);
    } else if (request.method === 'POST' && request.url.startsWith('/api/g-plus')) {
        handleGPlusRequest(request, response);
    } else {
        // console.log(`handle non-API request`);
        // console.log(`Origin: ${origin}`);
        // console.log(`Method: ${request.method}`);
        // console.log(`URL: ${request.url}`);
        // Handle non-API requests (like serving a basic HTML page)
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.write('<div style="text-align:center;margin-top: 20vh;width:100%">Congratulations, your website is created and running!</div>');
        response.end();
    }
});


// Handle HubSpot API request
function handleHubspotRequest(request, response) {

    // console.log(`handleHubspotRequest`);
    let body = '';

    request.on('data', chunk => {
        body += chunk.toString();
    });

    request.on('end', () => {
        const hubspotUrl = new URL('https://api.hubspot.com' + request.url.replace('/api/hubspot', ''));
        const options = {
            hostname: hubspotUrl.hostname,
            path: hubspotUrl.pathname + hubspotUrl.search,
            method: request.method,
            headers: {
                'Authorization': `Bearer ${process.env.HUBSPOT_CRM_API_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const hubspotRequest = https.request(options, hubspotResponse => {
            let hubspotData = '';

            hubspotResponse.on('data', chunk => {
                hubspotData += chunk.toString();
            });

            hubspotResponse.on('end', () => {
                response.writeHead(hubspotResponse.statusCode, {
                    ...hubspotResponse.headers,
                    'Access-Control-Allow-Origin': '*',
                });
                response.end(hubspotData);
            });
        });

        hubspotRequest.on('error', error => {
            console.error('Error with HubSpot API request:', error);
            response.writeHead(500, { 'Content-Type': 'text/plain' });
            response.end('Internal Server Error');
        });

        hubspotRequest.write(body);
        hubspotRequest.end();
    });
}

// Handle other CRM API request
function handleGPlusRequest(request, response) {
    // console.log(`handleGPlusRequest`);
    let body = '';

    request.on('data', chunk => {
        body += chunk.toString();
    });

    request.on('end', () => {
        const crmData = JSON.parse(body);
        const postData = new URLSearchParams({
            action: 'partner-custom-form',
            token: process.env.GPLUS_API_TOKEN,
            partner_id: process.env.PARTNER_ID,
            name: crmData.name,
            phone: crmData.phone,
            email: crmData.email,
            building_id: process.env.BUILDING_ID,
            lang: crmData.lang || 'en',
            note: crmData.note,
            adv_id: crmData.adv_id || process.env.DEFAULT_ADV_ID,
            ...crmData.utmParams
        }).toString();

        const crmUrl = new URL('https://crm.g-plus.app/api/actions');
        const options = {
            hostname: crmUrl.hostname,
            path: crmUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const crmRequest = https.request(options, crmResponse => {
            let crmData = '';

            crmResponse.on('data', chunk => {
                crmData += chunk.toString();
            });

            crmResponse.on('end', () => {
                response.writeHead(crmResponse.statusCode, {
                    ...crmResponse.headers,
                    'Access-Control-Allow-Origin': '*',
                });
                response.end(crmData);
            });
        });

        crmRequest.on('error', error => {
            console.error('Error with CRM API request:', error);
            response.writeHead(500, { 'Content-Type': 'text/plain' });
            response.end('Internal Server Error');
        });

        crmRequest.write(postData);
        // console.log(`postData: ${postData}`);
        crmRequest.end();
    });
}

const defaultServerPort = 3000;

// Start the server on the specified port
server.listen(process.env.PORT || defaultServerPort, process.env.HOSTNAME || '0.0.0.0', () => {
    console.log(`Server is running on ${process.env.HOSTNAME || '0.0.0.0'}:${process.env.PORT || defaultServerPort}`);
});
