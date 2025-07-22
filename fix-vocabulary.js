// Add this to a new file: fix-vocabulary.js
const fs = require('fs');

// Read current vocabulary
const vocab = JSON.parse(fs.readFileSync('vocabulary.json', 'utf8'));

// Template for missing activities (based on existing patterns)
const activityTemplate = {
    "Feature Complete": 0.13,
    "Testing": 0.12,
    "Post-Release": 0.06,
    "Ready for QA": 0.08,
    "Bug Fix": 0.07,
    "Closed": 0.06,
    "Abandoned": 0.08
};

// Find missing activities
const eventTypes = Object.keys(vocab.EVENT_TYPE).filter(key => key.startsWith('Activity'));
const existingActivities = Object.keys(vocab).filter(key => key.startsWith('Activity'));
const missingActivities = eventTypes.filter(activity => !existingActivities.includes(activity));

console.log(`Found ${missingActivities.length} missing activities:`, missingActivities);

// Add missing transition mappings
missingActivities.forEach(activity => {
    const activityNum = parseInt(activity.replace('Activity', ''));

    // Create transitions based on activity number ranges
    if (activityNum >= 164 && activityNum <= 200) {
        const transitions = {
            [`Activity${Math.max(51, activityNum - 10)}`]: 0.17,
            [`Activity${Math.max(52, activityNum - 5)}`]: 0.15,
            "Feature Complete": 0.13,
            "Testing": 0.12,
            [`Activity${Math.min(200, activityNum + 5)}`]: 0.11,
            [`Activity${Math.min(200, activityNum + 10)}`]: 0.10,
            "Post-Release": 0.06,
            "Ready for QA": 0.08,
            "Abandoned": 0.08
        };
        vocab[activity] = transitions;
    }
});

// Add references to missing activities in existing transitions
Object.keys(vocab).forEach(key => {
    if (key.startsWith('Activity') && typeof vocab[key] === 'object') {
        const activityNum = parseInt(key.replace('Activity', ''));

        // Add transitions TO missing activities from existing ones
        if (activityNum >= 100 && activityNum <= 150) {
            missingActivities.slice(0, 5).forEach((missingActivity, index) => {
                if (!vocab[key][missingActivity]) {
                    vocab[key][missingActivity] = 0.018;
                }
            });
        }
    }
});

// Write updated vocabulary
fs.writeFileSync('vocabulary.json', JSON.stringify(vocab, null, 4));
console.log('Updated vocabulary.json with missing activity transitions');
