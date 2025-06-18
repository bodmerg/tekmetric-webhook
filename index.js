const express = require('express');
const axios = require('axios');
const app = express();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) {
  console.error('Error: DISCORD_WEBHOOK_URL environment variable not set.');
  process.exit(1);
}

app.use(express.json());

// Cache:
// key = repairOrderNumber (friendly number), value = customerName
const roCustomerCache = {};
// key = repairOrderId (internal ID), value = repairOrderNumber
const idToRoCache = {};

app.post('/tekmetric-webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  // Extract IDs
  const repairOrderNumber = data.repairOrderNumber || null;
  const repairOrderId = data.id || data.repairOrderId || null;

  // Cache customer name when available, keyed by repairOrderNumber
  if (repairOrderNumber && data.customer?.firstName && data.customer?.lastName) {
    roCustomerCache[repairOrderNumber] = `${data.customer.firstName} ${data.customer.lastName}`;
    console.log(`[CACHE] Stored customer name "${roCustomerCache[repairOrderNumber]}" for RO #${repairOrderNumber}`);
  }

  // Cache mapping of repairOrderId => repairOrderNumber for use in payment events
  if (repairOrderId && repairOrderNumber) {
    idToRoCache[repairOrderId] = repairOrderNumber;
    console.log(`[CACHE] Stored RO ID ${repairOrderId} => RO #${repairOrderNumber}`);
  }

  // Determine customer name
  let customerName = 'Unknown Customer';

  // Priority: from payload customer info
  if (data.customer?.firstName && data.customer?.lastName) {
    customerName = `${data.customer.firstName} ${data.customer.lastName}`;
  } else {
    // Only parse customer name from event string if it does NOT start with "Repair Order"
    if (!event.startsWith('Repair Order')) {
      const nameMatch = event.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
      if (nameMatch && nameMatch[1]) {
        customerName = nameMatch[1];
        console.log(`[NO CACHE] Parsed customer from event string: ${customerName}`);
      } else {
        console.log(`[NO CACHE] Customer name unknown`);
      }
    } else {
      console.log(`[NO CACHE] Event starts with 'Repair Order', skip parsing customer name from event string`);
    }
  }

  // Resolve effective repair order number for messaging
  let effectiveRoNumber = repairOrderNumber;
  if (!effectiveRoNumber && repairOrderId && idToRoCache[repairOrderId]) {
    effectiveRoNumber = idToRoCache[repairOrderId];
    console.log(`[CACHE] Resolved RO #${effectiveRoNumber} from RO ID ${repairOrderId}`);
  }
  if (!effectiveRoNumber) {
    effectiveRoNumber = 'Unknown';
  }

  let message = null;

  try {
    // Estimate Viewed
    if (event.toLowerCase().includes('estimate') && event.toLowerCase().includes('viewed')) {
      message = `🧐 **Estimate Viewed**\n${customerName} viewed estimate for RO #${effectiveRoNumber}`;
    }

    // Work Approved / Declined (based on jobs array)
    else if (event.toLowerCase().includes('approved') && event.toLowerCase().includes('declined')) {
      const approvedCount = data.jobs?.filter(job => job.authorized === true).length || 0;
      const declinedCount = data.jobs?.filter(job => job.authorized === false).length || 0;
      message = `🔧 **Work Authorization**\n${customerName} approved ${approvedCount} job(s) and declined ${declinedCount} job(s) for RO #${effectiveRoNumber}`;
    }

    // Repair Order Completed
    else if (data.repairOrderStatus?.name?.toLowerCase() === 'complete' || data.repairOrderStatus?.name?.toLowerCase() === 'completed') {
      message = `🎉 **RO Completed**\nRO #${effectiveRoNumber} for ${customerName} is marked as completed.`;
    }

    // Payment Received (fully paid)
    else if (data.amountPaid && data.amountPaid > 0 && data.totalSales && data.amountPaid === data.totalSales) {
      const total = (data.amountPaid / 100).toFixed(2);
      message = `💳 **Payment Received**\nRO #${effectiveRoNumber} for ${customerName} has been paid in full.\nTotal: $${total}`;
    }

    // Payment Made (partial or any payment event)
    else if (event.toLowerCase().includes('payment made')) {
      const amount = data.amount ? (data.amount / 100).toFixed(2) : 'Unknown';
      const payer = data.payerName || customerName;
      message = `💵 **Payment Made**\n${payer} paid $${amount} for RO #${effectiveRoNumber}`;
    }

    // Inspection Completed
    else if (event.toLowerCase().includes('inspection') && event.toLowerCase().includes('complete')) {
      message = `🔍 **Inspection Complete**\n${data.name || 'Inspection'} completed for RO #${effectiveRoNumber} for ${customerName}`;
    }

    // Part Received
    else if (event.toLowerCase().includes('purchase order') && event.toLowerCase().includes('received')) {
      const poMatch = event.match(/Purchase Order #(\d+)/);
      const poNumber = poMatch ? poMatch[1] : 'Unknown';
      message = `📦 **Part Received**\nPurchase Order #${poNumber} marked as received.`;
    }

    if (message) {
      await axios.post(DISCORD_WEBHOOK_URL, { content: message });
      res.status(200).send('Notification sent to Discord');
      console.log(`[MESSAGE SENT] ${message}`);
    } else {
      console.log(`[NO HANDLER] Event: "${event}"`);
      res.status(200).send('No matching event handled');
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Error handling webhook');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Tekmetric webhook listener running on port ${PORT}`));
