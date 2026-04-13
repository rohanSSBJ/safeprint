# SafePrint

**A privacy-first, AI-powered campus print platform**

SafePrint solves a simple but serious problem: when students print personal documents at local shops, those files often stay behind on public computers. That creates a privacy risk and a bad user experience.

SafePrint fixes this by giving students a safer way to print and giving shop owners smarter tools to run their business. Students can find nearby print shops, upload files securely, and pay quickly. Shop owners get live demand insights, dynamic pricing, and an AI-powered dashboard to manage operations better.

## The Problem

Traditional campus print shops still work in a very manual way.

- Students do not know which shop is free and which one has a long queue.
- Sensitive files like Aadhaar cards, bank statements, and certificates can be left on shop systems after printing.
- Most shops still depend on cash or slow manual payment handling.
- Shop owners do not get useful business data to predict rush hours or improve earnings.

## Why Privacy Is Our USP

Privacy is the biggest reason SafePrint stands out.

Instead of sending files through random chats, email, or public desktops, SafePrint uses a secure file flow designed for printing. Files are encrypted before they are sent, used only for the print process, and removed after printing so student documents are not left behind on shop computers.

This makes SafePrint not just a faster print solution, but a safer one.

## How SafePrint Works

1. A student opens SafePrint and checks nearby print shops on the live map.
2. The student sees each shop's real-time status, like free, moderate, or busy.
3. The file is uploaded through a secure encrypted flow.
4. The shop receives the print request and prepares the document.
5. The student pays using a UPI QR code at the point of service.
6. After printing, the file is removed so no private document is left behind.

## Features For Students

- Live map of nearby print shops using real-time availability
- Secure encrypted file upload for private documents
- Faster printing with less waiting and less confusion
- UPI QR-based payment flow at pickup
- Safer document handling without depending on public PCs
- Better trust when printing important personal files

## Features For Shop Owners

- AI-powered Command Center dashboard
- Predictive Traffic Forecaster to estimate busy hours in advance
- Dynamic pricing that can increase rates during rush hours and offer discounts during slow hours
- AI Shop Assistant for asking business questions in simple language
- Live shop status controls so owners can update availability instantly
- Business insights that help improve revenue and daily operations

## Why SafePrint Wins

SafePrint solves trust, speed, and revenue problems in one platform.

- Students get a safer and smoother printing experience.
- Shop owners can serve more people with less chaos.
- Shops can make smarter pricing decisions based on real demand.
- The platform turns local print shops into data-driven micro-businesses.

## Product Stack

SafePrint is built with a modern web stack that supports both secure printing and business intelligence.

| Component | Purpose | Tech |
| :--- | :--- | :--- |
| Frontend | Student and shop owner experience | React 18, Tailwind CSS |
| Backend | Print workflow and APIs | Node.js, Express |
| Security | Client-side encryption | CryptoJS |
| Maps | Nearby shop discovery | Leaflet.js |
| Analytics UI | Lightweight dashboard visuals | Native SVG |
| Printing | Printer handoff and PDF handling | `pdf-to-printer`, `muhammara` |

## Getting Started

### Prerequisites

- Node.js v16+
- npm or yarn
- A printer configured on your machine for backend printing

### Setup

1. Clone the repository

```bash
git clone https://github.com/varshithareddyallu/safeprint.git
cd safeprint
```

2. Install dependencies

```bash
npm install
cd Frontend && npm install
cd ../backend && npm install
```

3. Run the app

```bash
npm run dev
```

## Closing Pitch

SafePrint brings privacy, convenience, and business intelligence to a part of campus life that has been ignored for too long. It helps students print with confidence and helps print shops grow with smarter tools.
