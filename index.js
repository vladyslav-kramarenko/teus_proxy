const http = require('http');
const https = require('https');
const { URL } = require('url');
const Busboy = require('busboy');
const nodemailer = require('nodemailer');
const { uploadFile } = require('./googleDriveService');
const formidable = require('formidable');
const fs = require('fs'); // Make sure fs is required at the top
require('dotenv').config();

const allowedOrigins = [
    'https://dev.teus-group.com',
    'https://ads.teus-group.com',
    'https://desire-antalya.com',
    'https://ads.desire-antalya.com',
    'https://promo.desire-antalya.com',
    'https://teus-group.com'
];

// console.log(`HubSpot API Key: ${process.env.GPLUS_API_TOKEN ? 'Loaded' : 'Not Loaded'}`);

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS
    },
});

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
        console.log(`Handle OPTIONS requests`);
        response.writeHead(204); // No Content
        response.end();
        return;
    }
    if (request.method === 'GET' && request.url.startsWith('/api/location')) {
        console.log(`Fetching location for IP`);
        handleLocationRequest(request, response);
    } else if (request.method === 'POST' && request.url.startsWith('/api/hubspot')) {
        console.log(`handleHubspotRequest`);
        handleHubspotRequest(request, response);
    } else if (request.method === 'POST' && request.url.startsWith('/api/g-plus')) {
        console.log(`handleGPlusRequest`);
        handleGPlusRequest(request, response);
    } else if (request.method === 'POST' && request.url.startsWith('/api/vacancies/apply')) {
        console.log(`handleEmailRequest`);
        handleEmailRequest(request, response);
    } else {
        // Handle non-API requests (like serving a basic HTML page)
        console.log(`Handle non-API requests`);
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.write('<div style="text-align:center;margin-top: 20vh;width:100%">Congratulations, your website is created and running!</div>');
        response.end();
    }
});

function handleLocationRequest(request, response) {
    // Extract the real client IP
    const forwardedFor = request.headers['x-forwarded-for'];
    const realIP = request.headers['x-real-ip'];
    const internalRealIP = request.headers['x-internal-real-ip'];
    const socketIP = request.socket.remoteAddress;

    // Prioritize IP extraction
    const clientIP = forwardedFor?.split(',')[0].trim() || realIP || internalRealIP || socketIP;

    // console.log(`Detected Client IP: ${clientIP}`);

    // Ensure valid external IP (strip out IPv6 local and reserved IPs)
    const sanitizedIP = clientIP.includes('::ffff:') ? clientIP.split('::ffff:')[1] : clientIP;

    // Check if it's a reserved or private IP
    if (
        sanitizedIP.startsWith('10.') || // Private range
        sanitizedIP.startsWith('192.168.') || // Private range
        sanitizedIP.startsWith('127.') || // Loopback
        sanitizedIP.startsWith('169.254.') || // Link-local
        sanitizedIP.startsWith('::1') || // IPv6 localhost
        sanitizedIP === 'localhost'
    ) {
        console.error('Detected a reserved or private IP:', sanitizedIP);
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid or reserved IP address', ip: sanitizedIP }));
        return;
    }

    // Fetch location data from ipapi.co
    const locationAPI = `https://ipapi.co/${sanitizedIP}/json/`;
    // console.log(`Fetching location from: ${locationAPI}`);
    
    https.get(locationAPI, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
           try {
                const jsonResponse = JSON.parse(data);
                // console.log('Location API Response:', jsonResponse);
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(data);
            } catch (err) {
                console.error('Error parsing location API response:', err);
                response.writeHead(500, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ error: 'Failed to parse location data' }));
            }
        });
    }).on('error', (error) => {
        console.error('Error fetching location:', error);
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Failed to fetch location' }));
    });
}

function handleEmailRequest(request, response) {
    console.log("Initializing Formidable for request parsing...");

    const form = new formidable.IncomingForm();

    form.parse(request, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing the form:', err);
            response.writeHead(500, { 'Content-Type': 'text/plain' });
            response.end('Form parsing error');
            return;
        }

        console.log('Fields received:', fields);
        console.log('Files received:', files);

        const applicantDetails = fields;
        const resumeFile = files.resume && files.resume[0]; // Access the uploaded file

        if (resumeFile) {
            try {
                // Debugging: Check file path and size
                console.log(`File path: ${resumeFile.filepath}`);
                console.log(`File size: ${resumeFile.size}`);
                
                // Read the file from its temporary path
                const fileBuffer = await fs.promises.readFile(resumeFile.filepath);
                
                // Debugging: Confirm file buffer size
                console.log(`File buffer length: ${fileBuffer.length}`);
                
                console.log(`Uploading file to Google Drive: ${resumeFile.originalFilename}`);
                
                // Upload file to Google Drive
                const fileUrl = await uploadFile(fileBuffer, resumeFile.originalFilename, resumeFile.mimetype);
                
                // Prepare and send the email with the file URL
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: 'hr@teus-group.com',
                    subject: 'New Vacancy Application',
                    text: `Applicant Details:\nName: ${applicantDetails.name}\nSurname: ${applicantDetails.surname}\nEmail: ${applicantDetails.email}\nPhone: ${applicantDetails.phone}\n\nResume: ${fileUrl}`,
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error sending email:', error);
                        response.writeHead(500, { 'Content-Type': 'text/plain' });
                        response.end('Error sending application');
                        return;
                    }
                    console.log('Email sent successfully.');
                    response.writeHead(200, { 'Content-Type': 'text/plain' });
                    response.end('Application sent successfully!');
                });
            } catch (error) {
                console.error('Error reading file or uploading to Google Drive:', error);
                response.writeHead(500, { 'Content-Type': 'text/plain' });
                response.end('File handling error');
            }
        } else {
            console.warn('No file data received.');
            response.writeHead(400, { 'Content-Type': 'text/plain' });
            response.end('No file attached');
        }
    });
}

// Handle HubSpot API request
function handleHubspotRequest(request, response) {
    try{
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
        
        
        console.log("Making HubSpot API request...");
        //console.log("Request options:", options);
        console.log("Request body:", body);

        const hubspotRequest = https.request(options, hubspotResponse => {
            let hubspotData = '';

            hubspotResponse.on('data', chunk => {
                hubspotData += chunk.toString();
            });

            hubspotResponse.on('end', () => {
                
                //console.log("HubSpot API response status:", hubspotResponse.statusCode);
                //console.log("HubSpot API response headers:", hubspotResponse.headers);
                ..console.log("HubSpot API response body:", hubspotData);
                
                if (hubspotResponse.statusCode === 409) {
                    try {
                        const conflictData = JSON.parse(hubspotData);
                        const existingContactId = conflictData.message.match(/ID: (\d+)/)?.[1];
                        if (existingContactId) {
                            //console.log("Extracted Contact ID:", existingContactId);
                            response.writeHead(200, { 'Content-Type': 'application/json' });
                            response.end(JSON.stringify({ id: existingContactId }));
                        } else {
                            console.error("Unable to extract contact ID from conflict response.");
                            response.writeHead(500, { 'Content-Type': 'application/json' });
                            response.end(JSON.stringify({ error: 'Conflict but no contact ID provided' }));
                        }
                    } catch (error) {
                        console.error("Error handling conflict response:", error);
                        response.writeHead(500, { 'Content-Type': 'application/json' });
                        response.end(JSON.stringify({ error: 'Failed to parse conflict response' }));
                    }
                }  else {
                    response.writeHead(hubspotResponse.statusCode, {
                        ...hubspotResponse.headers,
                        'Access-Control-Allow-Origin': '*',
                    });
                    //response.end(JSON.stringify({ id: successData.id }));
                    response.end(hubspotData);
                    // console.log(hubspotData);
                }
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
    }catch (error){
        console.error(error);
    }
}

// Handle other CRM API request
function handleGPlusRequest(request, response) {
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
            building_id: crmData.building_id || process.env.BUILDING_ID,
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
        crmRequest.end();
    });
}

// Start the server on the specified port
server.listen(process.env.PORT || 3000, process.env.HOSTNAME || '0.0.0.0', () => {
    console.log(`Server is running on ${process.env.HOSTNAME || '0.0.0.0'}:${process.env.PORT || 3000}`);
});
