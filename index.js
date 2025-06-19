const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

const DISCORD_WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_URL_HERE';

app.use(express.json());

// Keep-alive ping handler
app.get('/webhook', (req, res) => {
  console.log('💡 Keep-alive ping received');
  res.status(200).send('OK');
});

// Utility: Format currency
const formatCurrency = (value) => `$${(value / 100).toFixed(2)}`;

// Utility: Build Discord embed
const buildEmbed = (title, description, color) => ({
  embeds: [
    {
      title,
      description,
      color,
      timestamp: new Date().toISOString(),
    }
  ]
});

// Event handler
app.post('/webhook', async (req, res) => {
  const payload = req.body;
  if (!payload || !payload.event || !payload.data) {
    console.log('❌ Invalid payload');
    return res.status(400).send('Bad Request');
  }

  const { event, data } = payload;
  let embed;

  try {
    switch (event) {
      case 'Grant Bodmer viewed estimate for Repair Order #12558': {
        embed = buildEmbed(
          '📄 Estimate Viewed',
          `Customer ${data.customer.firstName} ${data.customer.lastName} viewed estimate for Repair Order #${data.repairOrderNumber}`,
          0x3498db
        );
        break;
      }

      case 'Grant Bodmer approved 1 job(s) and declined 0 job(s) for Repair Order #12558': {
        embed = buildEmbed(
          '🛠️ Work Authorization',
          `Customer ${data.customer?.firstName || 'Unknown'} ${data.customer?.lastName || 'Customer'} responded to jobs for Repair Order #${data.repairOrderNumber}\nApproved Jobs: ${data.jobs.filter(j => j.authorized).length}\nDeclined Jobs: ${data.jobs.filter(j => !j.authorized).length}`,
          0xf1c40f
        );
        break;
      }

      case 'Repair Order #12558 completed by grantdigitalart@gmail.com': {
        const customerName = data.customerName || 'Unknown Customer';
        embed = buildEmbed(
          '✅ Work Completed',
          `Repair Order #${data.repairOrderNumber || data.id} for customer ${customerName} has been marked as completed.\n\n` +
          `Labor: ${formatCurrency(data.laborSales)}\nParts: ${formatCurrency(data.partsSales)}\nFees: ${formatCurrency(data.feeTotal)}\nTotal: ${formatCurrency(data.totalSales)}`,
          0x2ecc71
        );
        break;
      }

      case 'Payment made by Grant Bodmer': {
        const roNumber = data.repairOrderNumber || data.repairOrderId;
        const amount = formatCurrency(data.amount);
        embed = buildEmbed(
          '💵 Payment Received',
          `A payment of ${amount} was made on Repair Order #${roNumber}\nPayment Method: ${data.paymentType.name}`,
          0x9b59b6
        );
        break;
      }

      case 'Inspection marked complete by grantdigitalart@gmail.com': {
        embed = buildEmbed(
          '🔍 Inspection Completed',
          `Inspection "${data.name}" was completed for Repair Order #${data.repairOrderId}`,
          0xe67e22
        );
        break;
      }

      case 'Purchase Order #4321 marked as received': {
        embed = buildEmbed(
          '📦 Parts Order Received',
          `Purchase Order #${data.purchaseOrderId} has been marked as received.`,
          0x1abc9c
        );
        break;
      }

      default:
        embed = buildEmbed(
          '📬 New Event',
          `Received event: ${event}`,
          0x95a5a6
        );
    }

    await axios.post(DISCORD_WEBHOOK_URL, embed);
    console.log(`📤 Sent Discord message for event: ${event}`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error sending message to Discord:', error);
    res.status(500).send('Failed to send message');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});
