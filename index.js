const http = require('http');
const https = require('https');
const { URL } = require('url');
require('dotenv').config();

const allowedOrigins = [
    'http://localhost:3000',
    'https://dev.teus-group.com',
    'https://teus-group.com'
];

// Create a server to handle incoming requests
const server = http.createServer((request, response) => {
    // Set CORS headers
    const origin = request.headers.origin;

    // Log the incoming request details
    console.log(`Incoming Request:`);
    console.log(`Origin: ${origin}`);
    console.log(`Method: ${request.method}`);
    console.log(`URL: ${request.url}`);

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
        let body = '';

        // Collect the data from the request
        request.on('data', chunk => {
            body += chunk.toString();
        });

        // When the data is fully received, process it
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

            // Create the request to HubSpot API
            const hubspotRequest = https.request(options, hubspotResponse => {
                let hubspotData = '';

                // Collect data from the HubSpot response
                hubspotResponse.on('data', chunk => {
                    hubspotData += chunk.toString();
                });

                // When all data is received, send it back to the original requester
                hubspotResponse.on('end', () => {
                    response.writeHead(hubspotResponse.statusCode, {
                        ...hubspotResponse.headers,
                        'Access-Control-Allow-Origin': '*',
                    });
                    response.end(hubspotData);
                });
            });

            // Handle errors with the HubSpot request
            hubspotRequest.on('error', error => {
                console.error('Error with HubSpot API request:', error);
                response.writeHead(500, { 'Content-Type': 'text/plain' });
                response.end('Internal Server Error');
            });

            // Send the collected body data to HubSpot
            hubspotRequest.write(body);
            hubspotRequest.end();
        });
    } else {
        // Handle non-API requests (like serving a basic HTML page)
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.write('<div style="text-align:center;margin-top: 20vh;width:100%">Congratulations, your website is created and running!</div>');
        response.end();
    }
});

// Start the server on the specified port
server.listen(process.env.PORT || 3000, process.env.HOSTNAME || '0.0.0.0', () => {
    console.log(`Server is running on ${process.env.HOSTNAME || '0.0.0.0'}:${process.env.PORT || 3000}`);
});
