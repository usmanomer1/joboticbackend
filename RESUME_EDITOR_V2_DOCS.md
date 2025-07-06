# Resume Editor V2 API Documentation

## Overview
The Resume Editor V2 provides a simple edit interface that:
- Preserves the exact resume format
- Parses content into editable fields
- Allows field-by-field editing
- Regenerates PDF with same format

## Endpoints

### 1. Parse Resume for Editing
**POST** `/api/resume-editor-v2/parse-for-edit`

**Request:**
```json
{
  "resumeText": "John Doe\n123-456-7890 | john@email.com\n\nEXPERIENCE\nSoftware Engineer\nABC Company\n2020-2023\n• Built web applications\n• Worked with team",
  "jobDescription": "Optional job description for AI enhancement",
  "userId": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "pdfUrl": "https://...",
    "editSchema": [
      {
        "id": "personal",
        "title": "Personal Information",
        "type": "personal",
        "fields": [
          {
            "id": "name",
            "label": "Name",
            "type": "text",
            "value": "John Doe"
          },
          {
            "id": "contact_1",
            "label": "Contact Info",
            "type": "text",
            "value": "123-456-7890 | john@email.com"
          }
        ]
      },
      {
        "id": "experience",
        "title": "EXPERIENCE",
        "type": "experience",
        "items": [
          {
            "id": "item-uuid",
            "fields": [
              {
                "id": "line_0",
                "label": "Title",
                "type": "text",
                "value": "Software Engineer"
              },
              {
                "id": "line_1",
                "label": "Info 1",
                "type": "text",
                "value": "ABC Company"
              },
              {
                "id": "line_2",
                "label": "Info 2",
                "type": "text",
                "value": "2020-2023"
              },
              {
                "id": "bullets",
                "label": "Bullet Points",
                "type": "bullets",
                "value": [
                  "Built web applications",
                  "Worked with team"
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### 2. Update Field
**POST** `/api/resume-editor-v2/update-field`

**Request:**
```json
{
  "sessionId": "uuid",
  "sectionId": "experience",
  "itemId": "item-uuid",
  "fieldId": "bullets",
  "newValue": [
    "Built scalable web applications using React and Node.js",
    "Collaborated with cross-functional team of 5 developers",
    "Improved application performance by 40%"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pdfUrl": "https://...",
    "updatedText": "Full updated resume text..."
  }
}
```

## Frontend Implementation Guide

### Left Panel - PDF Preview
```jsx
<iframe src={pdfUrl} width="100%" height="100%" />
```

### Right Panel - Edit Form
```jsx
{editSchema.map(section => (
  <div key={section.id}>
    <h3>{section.title}</h3>
    
    {section.type === 'personal' && (
      section.fields.map(field => (
        <input
          key={field.id}
          label={field.label}
          value={field.value}
          onChange={(e) => updateField(section.id, null, field.id, e.target.value)}
        />
      ))
    )}
    
    {section.type === 'experience' && (
      section.items.map(item => (
        <div key={item.id}>
          {item.fields.map(field => (
            field.type === 'bullets' ? (
              <BulletEditor
                key={field.id}
                bullets={field.value}
                onChange={(bullets) => updateField(section.id, item.id, field.id, bullets)}
              />
            ) : (
              <input
                key={field.id}
                label={field.label}
                value={field.value}
                onChange={(e) => updateField(section.id, item.id, field.id, e.target.value)}
              />
            )
          ))}
        </div>
      ))
    )}
  </div>
))}
```

### Bullet Point Editor Component
```jsx
const BulletEditor = ({ bullets, onChange }) => {
  const addBullet = () => {
    onChange([...bullets, '']);
  };
  
  const updateBullet = (index, value) => {
    const updated = [...bullets];
    updated[index] = value;
    onChange(updated);
  };
  
  const removeBullet = (index) => {
    onChange(bullets.filter((_, i) => i !== index));
  };
  
  return (
    <div>
      {bullets.map((bullet, index) => (
        <div key={index}>
          <input
            value={bullet}
            onChange={(e) => updateBullet(index, e.target.value)}
          />
          <button onClick={() => removeBullet(index)}>Remove</button>
        </div>
      ))}
      <button onClick={addBullet}>Add Bullet</button>
    </div>
  );
};
```

## Key Features

1. **Format Preservation**: The original format is maintained exactly
2. **Simple Parsing**: Identifies sections and fields without complex logic
3. **Flexible Editing**: Each field can be edited individually
4. **Bullet Management**: Add, edit, or remove bullet points
5. **Real-time Preview**: PDF regenerates on each update

## Section Types

- **personal**: Name and contact information
- **experience**: Job entries with title, company, dates, and bullets
- **education**: School entries with institution, degree, dates
- **skills**: Skill categories or lists
- **other**: Any other section type (summary, etc.)

## Notes

- The system preserves exact formatting including spacing and line breaks
- Only content is modified, never the structure
- PDF is regenerated using simple text-to-PDF conversion
- All original formatting is maintained in the output