const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// 🟢 Keep-alive handler (GET)
app.get('/webhook', (req, res) => {
  console.log('🟢 Keep-alive ping received at /webhook');
  res.status(200).send('Alive and kicking!');
});

// 📨 Main webhook POST handler
app.post('/webhook', async (req, res) => {
  try {
    const eventData = req.body;
    
    console.log('📩 Event received:', eventData.event);

    // Prepare the embed based on event type
    let embed = {
      color: 0x00FF00, // Default to green, can adjust per event type
      title: 'Webhook Event',
      description: `Event: ${eventData.event}`,
      fields: []
    };

    // Process different types of events
    switch (eventData.event) {
      case 'Repair Order Created':
        embed.title = 'New Repair Order';
        embed.fields.push({
          name: 'Repair Order #',
          value: `#${eventData.data.repairOrderNumber}`,
        });
        break;
      
      case 'Work Completed':
        embed.title = '✅ Work Completed';
        embed.description = `Repair Order #${eventData.data.repairOrderNumber} for customer ${eventData.data.customer ? eventData.data.customer.firstName + ' ' + eventData.data.customer.lastName : 'Unknown Customer'} has been marked as completed.`;
        embed.fields.push({
          name: 'Labor',
          value: `$${(eventData.data.laborSales / 100).toFixed(2)}`,
        });
        embed.fields.push({
          name: 'Parts',
          value: `$${(eventData.data.partsSales / 100).toFixed(2)}`,
        });
        embed.fields.push({
          name: 'Fees',
          value: `$${(eventData.data.feeTotal / 100).toFixed(2)}`,
        });
        embed.fields.push({
          name: 'Total',
          value: `$${((eventData.data.totalSales + eventData.data.feeTotal) / 100).toFixed(2)}`,
        });
        break;

      case 'Payment made':
        embed.title = '💵 Payment Received';
        embed.fields.push({
          name: 'Amount Paid',
          value: `$${(eventData.data.amount / 100).toFixed(2)}`,
        });
        embed.fields.push({
          name: 'Payment Method',
          value: eventData.data.paymentType.name,
        });
        break;

      default:
        embed.title = 'Unknown Event';
        embed.description = `Event type: ${eventData.event}`;
        break;
    }

    // Send the embed to Discord
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    await axios.post(webhookUrl, {
      embeds: [embed],
    });

    res.status(200).send('Webhook received and processed');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});
