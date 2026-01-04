# Inventory Management User Guide

Welcome to Inventory Management! This guide will help you get started with cataloging your items, organizing locations, scanning barcodes, and tracking loans.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Managing Items](#managing-items)
4. [Organizing Locations](#organizing-locations)
5. [Barcode Scanning](#barcode-scanning)
6. [Lending & Borrowing](#lending--borrowing)
7. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### Creating an Account

1. Navigate to the application and click **Create account**
2. Fill in your details (username, email, password)
3. Verify your email address
4. Log in to access your inventory

### First Steps

After logging in, we recommend:
1. Create a few **locations** to organize your space (e.g., "Living Room", "Garage", "Office")
2. Add your first **items** with descriptions and photos
3. Try the **barcode scanner** to quickly add items with barcodes

---

## Dashboard

Your dashboard provides a quick overview of your inventory:

- **Item Count**: Total number of items in your inventory
- **Location Count**: Number of locations you've created
- **Active Loans**: Items currently lent out or borrowed
- **Overdue Loans**: Loans past their due date (highlighted in red)

Quick actions are available to jump directly to:
- Manage Items
- Scan Barcode
- View Locations
- Lending Dashboard

---

## Managing Items

### Adding Items

1. Go to **Items** from the navigation menu
2. Fill out the "Add New Item" form:
   - **Name** (required): What is this item called?
   - **Type**: Book, Tool, Game, Electronics, Clothing, Collectible, or Other
   - **Location**: Where is it stored?
   - **Condition**: New, Like New, Good, Fair, or Poor
   - **Serial Number**: For electronics or valuable items
   - **Tags**: Comma-separated keywords for filtering
   - **Description**: Additional notes
3. Click **Create Item**

### Editing Items

1. Click on an item to view its details
2. Click the **Edit** button to expand the edit form
3. Make your changes and click **Save Changes**

### Moving Items

1. From the item detail page, find the "Move Item" card
2. Select the new location from the dropdown
3. Optionally add a note explaining the move
4. Click **Move**

All movements are recorded in the Movement History.

### Deleting Items

1. From the item detail page, scroll to the "Danger Zone"
2. Click **Delete Item**
3. Confirm the deletion in the modal

**Warning**: Deleting an item also removes all associated barcodes and movement history.

### Filtering Items

Use the filter bar at the top of the items list to:
- **Search** by name
- **Filter by type** (Book, Tool, etc.)
- **Filter by location** (including "Unassigned")

Click **Clear** to reset all filters.

---

## Organizing Locations

### Location Hierarchy

Locations can be nested to reflect your physical organization:

```
Home
├── Living Room
│   ├── Bookshelf
│   └── TV Stand
├── Garage
│   ├── Shelf A
│   │   ├── Box 1
│   │   └── Box 2
│   └── Workbench
└── Office
    └── Desk Drawer
```

### Creating Locations

1. Go to **Locations** from the navigation menu
2. Fill out the "Add New Location" form:
   - **Name** (required): e.g., "Garage Shelf A"
   - **Kind**: Room, Shelf, Box, Bin, Drawer, Cabinet, or Other
   - **Parent Location**: Select a parent to create nested locations
   - **QR Code**: Optional unique code for scanning
3. Click **Create Location**

### Location QR Codes

Assign QR codes to your locations for quick navigation:
1. Use a consistent prefix like `LOC:` (e.g., `LOC:garage-shelf-1`)
2. Print labels with these codes
3. Scan them to jump directly to that location

### Editing Locations

1. Click on a location to view its details
2. Click **Edit** to expand the edit form
3. Make your changes and click **Save Changes**

### Deleting Locations

1. From the location detail page, scroll to the "Danger Zone"
2. Click **Delete Location**
3. Confirm the deletion

**Note**: Items at this location will become "Unassigned". Child locations will move to the top level.

---

## Barcode Scanning

### Using the Camera Scanner

1. Go to **Scan** from the navigation menu
2. Click **Start Scanning**
3. Allow camera access when prompted
4. Point your camera at a barcode
5. The scanner will automatically detect and look up the code

### Supported Barcode Formats

- **EAN-13** / **EAN-8**: Most retail products
- **UPC-A** / **UPC-E**: US retail products
- **QR Code**: Quick Response codes (great for custom labels)
- **Code 128**: Logistics and shipping

### Manual Entry

If camera scanning doesn't work:
1. Enter the barcode number in the "Manual Entry" field
2. Click **Lookup**

### Scan Results

When you scan a code, one of three things happens:

1. **Item Found**: The code is already mapped to one of your items. Click to view it.
2. **Location Found**: The code matches a location QR code. Click to navigate there.
3. **Unknown Code**: The code isn't in your database. Create a new item and map the barcode to it.

### Mapping Barcodes to Items

1. Create or find the item you want to map
2. Go to the item detail page
3. In the "Barcodes" section, enter the code
4. Click **Map**

One item can have multiple barcodes (e.g., a book might have both ISBN-10 and ISBN-13).

---

## Lending & Borrowing

### Creating a Loan

1. Go to **Lending** from the navigation menu
2. Click **New Loan** to expand the form
3. Fill out the details:
   - **Item**: Which item are you lending/borrowing?
   - **Type**: "Lending out" (you give) or "Borrowing" (you receive)
   - **Condition at handoff**: Document the item's condition
   - **Counterparty Name**: Who are you lending to / borrowing from?
   - **Email/Phone**: Optional contact info
   - **Due Date**: When should it be returned?
   - **Notes**: Any additional information
4. Click **Create Loan**

### Returning a Loan

1. Find the loan in the "Active" tab
2. Click the **Return** button
3. The loan moves to the "History" tab with the return date recorded

### Loan History

The "History" tab shows all completed loans with:
- What was lent/borrowed
- Who it was with
- Condition at both handoff and return
- Date range

This is useful for:
- Tracking how often items are borrowed
- Checking condition changes over time
- Auditing your lending activity

### Overdue Loans

Loans past their due date are highlighted in red. The dashboard shows your overdue count.

---

## Tips & Best Practices

### Organizing Your Inventory

1. **Start with locations**: Set up your location hierarchy first
2. **Be consistent with naming**: Use a standard format (e.g., "Garage - Shelf A - Box 1")
3. **Use tags effectively**: Add tags like "electronics", "fragile", "valuable" for easy filtering
4. **Document condition**: Record condition when adding items and during loans

### Using Barcodes Effectively

1. **Scan retail barcodes**: Books, games, and products already have barcodes
2. **Create custom QR codes**: Use free QR generators for your own labels
3. **Label locations**: Print QR code labels for bins and shelves
4. **Map multiple codes**: One item can have multiple barcodes

### Tracking Loans

1. **Always set a due date**: Makes it easy to track overdue items
2. **Document condition**: Take photos and note condition at handoff
3. **Get contact info**: Email or phone for sending reminders
4. **Check the dashboard**: Keep an eye on your overdue count

### Security

1. **Use a strong password**: Combine letters, numbers, and symbols
2. **Don't share accounts**: Each user should have their own account
3. **Log out on shared devices**: Keep your inventory private

---

## Need Help?

Click the **Help** link in the navigation menu to access the full documentation.

If you encounter issues, check:
1. The Help documentation
2. The README file in the repository
3. Open an issue on GitHub

Happy organizing! 📦
