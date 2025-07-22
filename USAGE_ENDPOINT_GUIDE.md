# Job Search Usage Endpoint Guide

## Overview
I've created a dedicated endpoint for fetching job search usage data. This endpoint handles all the Supabase queries on the backend and returns formatted data ready for display.

## Endpoint Details

**URL**: `GET /api/jobs/usage`  
**Authentication**: Required (uses Supabase auth token)

## Response Format

```json
{
  "success": true,
  "data": {
    "currentMonth": {
      "month": "2025-01",
      "totalJobsViewed": 125,
      "searchSessions": 15,
      "totalRequests": 20,
      "remaining": "unlimited",  // or number
      "percentUsed": 0,          // 0 for unlimited plans
      "lastSearchAt": "2025-01-20T..."
    },
    "plan": {
      "name": "Plus",
      "priceId": "price_1Rf2oQGkowQ7SwlfhDDuOpFk",
      "limit": -1,              // -1 means unlimited
      "isUnlimited": true,
      "isActive": true
    },
    "history": [
      {
        "month": "2024-08",
        "totalJobsViewed": 150,
        "searchSessions": 18
      },
      // ... up to 6 months of history
    ],
    "recentSearches": [
      {
        "query": "software engineer Chicago",
        "jobsViewed": 20,
        "searchedAt": "2025-01-20T10:30:00Z"
      },
      // ... last 10 searches
    ]
  }
}
```

## Frontend Usage Example

```javascript
// Fetch usage data
const fetchUsageData = async () => {
  try {
    const response = await fetch('https://your-api.com/api/jobs/usage', {
      headers: {
        'Authorization': `Bearer ${supabaseToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Display current usage
      const { currentMonth, plan, history, recentSearches } = data.data;
      
      // Show usage bar (only if not unlimited)
      if (!plan.isUnlimited) {
        const usagePercent = currentMonth.percentUsed;
        // Update progress bar UI
      }
      
      // Display plan info
      console.log(`Plan: ${plan.name}`);
      console.log(`Jobs used: ${currentMonth.totalJobsViewed}`);
      console.log(`Remaining: ${currentMonth.remaining}`);
      
      // Show history chart
      history.forEach(month => {
        console.log(`${month.month}: ${month.totalJobsViewed} jobs`);
      });
    }
  } catch (error) {
    console.error('Failed to fetch usage data:', error);
  }
};
```

## Key Features

1. **Current Month Data**: Real-time usage for the current billing period
2. **Plan Information**: User's subscription plan and limits
3. **Historical Usage**: Last 6 months of usage data for charts
4. **Recent Searches**: Last 10 search queries for reference

## Notes

- All plans are currently set to unlimited (-1) as requested
- The `percentUsed` field is 0 for unlimited plans
- The `remaining` field shows "unlimited" for unlimited plans
- History is returned in chronological order (oldest to newest)
- All dates are in ISO 8601 format (UTC)

## Error Handling

If the request fails, you'll receive:
```json
{
  "success": false,
  "error": "Failed to fetch usage data"
}
```

## Testing with cURL

```bash
curl -X GET https://your-api.com/api/jobs/usage \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -H "Content-Type: application/json"
```

This endpoint eliminates the need for the frontend to query Supabase directly and handles all the complex aggregation logic on the backend.