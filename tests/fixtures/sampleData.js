/**
 * Sample test data fixtures
 */

module.exports = {
  // Sample resumes
  resumes: {
    seniorEngineer: `
Jane Smith
Senior Software Engineer
jane.smith@email.com | LinkedIn: /in/janesmith | GitHub: /janesmith

PROFESSIONAL SUMMARY
Accomplished Senior Software Engineer with 8+ years of experience designing and implementing 
scalable distributed systems. Expert in cloud architecture, microservices, and leading 
cross-functional teams. Proven track record of improving system performance by up to 50%.

TECHNICAL SKILLS
Languages: Python, JavaScript/TypeScript, Java, Go
Frontend: React, Redux, Next.js, Vue.js, HTML5, CSS3
Backend: Node.js, Express, Django, Spring Boot, GraphQL
Databases: PostgreSQL, MongoDB, Redis, Elasticsearch, DynamoDB
Cloud & DevOps: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes, CI/CD, Terraform
Tools: Git, JIRA, Datadog, New Relic, Jenkins

PROFESSIONAL EXPERIENCE

Senior Software Engineer | TechCorp Inc. | San Francisco, CA | 2020 - Present
• Led migration of monolithic application to microservices architecture, improving scalability by 300%
• Implemented automated CI/CD pipelines reducing deployment time from 2 hours to 15 minutes
• Mentored team of 5 junior developers, conducting code reviews and technical training sessions
• Designed and built real-time analytics dashboard processing 1M+ events per day using Kafka and Elasticsearch
• Reduced AWS costs by 40% through infrastructure optimization and auto-scaling implementation

Software Engineer | StartupXYZ | San Francisco, CA | 2018 - 2020
• Built RESTful APIs serving 100K+ daily active users with 99.9% uptime
• Implemented caching strategy using Redis, reducing database load by 60%
• Developed React-based admin dashboard for internal tools
• Integrated third-party payment systems (Stripe, PayPal) processing $2M+ monthly

Junior Software Engineer | Digital Agency | San Jose, CA | 2016 - 2018
• Developed full-stack web applications for 20+ client projects
• Collaborated with design team to implement responsive UI/UX
• Wrote comprehensive unit tests achieving 85% code coverage

EDUCATION
Master of Science in Computer Science | Stanford University | 2016
Bachelor of Science in Computer Engineering | UC Berkeley | 2014

CERTIFICATIONS
• AWS Certified Solutions Architect - Professional
• Google Cloud Professional Cloud Architect
• Certified Kubernetes Administrator (CKA)
`,

    juniorDeveloper: `
Mike Johnson
Software Developer
mike.j@email.com | (555) 987-6543

OBJECTIVE
Enthusiastic software developer with 2 years of experience seeking opportunities to grow 
and contribute to innovative projects.

SKILLS
- Programming: JavaScript, Python, HTML, CSS
- Frameworks: React, Express.js
- Databases: MySQL, MongoDB
- Tools: Git, VS Code

EXPERIENCE
Junior Developer - Small Tech Co (2022-Present)
- Developed web applications using React
- Fixed bugs and maintained existing code
- Participated in daily standup meetings

Intern - Local Agency (2021-2022)
- Assisted senior developers with projects
- Learned web development best practices
- Created simple websites for clients

EDUCATION
BS Computer Science - State University (2021)
GPA: 3.5/4.0

PROJECTS
Personal Portfolio Website
- Built using React and deployed on Netlify
- Showcases my projects and skills
`,

    dataScientist: `
Dr. Sarah Chen
Data Scientist & Machine Learning Engineer
sarah.chen@email.com | GitHub: /sarahchen | Publications: 15+

SUMMARY
Data Scientist with PhD in Machine Learning and 6 years of industry experience. 
Specialized in NLP, computer vision, and predictive modeling. Published researcher 
with expertise in deploying ML models at scale.

TECHNICAL EXPERTISE
Languages: Python, R, SQL, Scala, Julia
ML/DL: TensorFlow, PyTorch, Scikit-learn, XGBoost, Keras
Big Data: Spark, Hadoop, Hive, Airflow
Cloud ML: AWS SageMaker, Google Cloud AI Platform, Azure ML
Visualization: Tableau, PowerBI, Matplotlib, Seaborn, D3.js

EXPERIENCE
Senior Data Scientist | AI Corp | 2021-Present
• Led team developing NLP model improving customer sentiment analysis accuracy to 94%
• Built recommendation system increasing user engagement by 35%
• Deployed 10+ ML models to production using MLOps best practices

Data Scientist | Analytics Inc | 2018-2021
• Developed predictive models for customer churn reducing attrition by 25%
• Created computer vision system for quality control in manufacturing
• Presented findings to C-level executives and stakeholders

EDUCATION
PhD in Machine Learning | MIT | 2018
MS in Statistics | Stanford | 2014
BS in Mathematics | UC Berkeley | 2012
`
  },

  // Sample job postings
  jobs: {
    seniorBackendEngineer: {
      job_id: 'job_senior_backend_123',
      job_title: 'Senior Backend Engineer',
      employer_name: 'TechGiant Corp',
      job_description: `
We are seeking a Senior Backend Engineer to join our growing team. You will be responsible 
for designing and implementing scalable microservices, working with cloud infrastructure, 
and mentoring junior developers.

Requirements:
- 5+ years of backend development experience
- Strong experience with Node.js, Python, or Java
- Experience with AWS or other cloud platforms
- Knowledge of microservices architecture
- Experience with Docker and Kubernetes
- Strong understanding of databases (SQL and NoSQL)
- Excellent problem-solving skills

Nice to have:
- Experience with GraphQL
- Knowledge of event-driven architecture
- Experience with Kafka or similar messaging systems
- Open source contributions

Benefits:
- Competitive salary ($150K - $200K)
- Equity compensation
- Health, dental, and vision insurance
- Remote work options
- Professional development budget
`,
      job_required_skills: ['Node.js', 'Python', 'AWS', 'Docker', 'Kubernetes', 'Microservices'],
      job_required_experience: {
        required_experience_in_months: 60,
        experience_mentioned: true
      },
      job_is_remote: true,
      job_employment_type: 'FULLTIME',
      job_min_salary: 150000,
      job_max_salary: 200000,
      job_salary_currency: 'USD',
      job_salary_period: 'YEAR'
    },

    frontendReactDeveloper: {
      job_id: 'job_frontend_react_456',
      job_title: 'React Frontend Developer',
      employer_name: 'StartupCo',
      job_description: `
Join our fast-growing startup as a React Frontend Developer! You'll work on building 
beautiful, responsive user interfaces for our SaaS platform.

What you'll do:
- Build and maintain React components
- Collaborate with designers and backend engineers
- Optimize application performance
- Write clean, maintainable code

Requirements:
- 3+ years of React experience
- Strong JavaScript/TypeScript skills
- Experience with Redux or similar state management
- Understanding of responsive design
- Git proficiency

Preferred:
- Experience with Next.js
- Knowledge of testing frameworks (Jest, React Testing Library)
- Familiarity with GraphQL
- UI/UX design sense

Perks:
- Salary: $100K - $140K
- Stock options
- Flexible hours
- Learning budget
`,
      job_required_skills: ['React', 'JavaScript', 'TypeScript', 'Redux', 'CSS', 'HTML'],
      job_required_experience: {
        required_experience_in_months: 36,
        experience_mentioned: true
      },
      job_is_remote: false,
      job_city: 'San Francisco',
      job_state: 'CA',
      job_employment_type: 'FULLTIME'
    },

    dataEngineer: {
      job_id: 'job_data_engineer_789',
      job_title: 'Data Engineer',
      employer_name: 'DataCorp Analytics',
      job_description: `
We're looking for a Data Engineer to help build and maintain our data infrastructure.

Responsibilities:
- Design and build data pipelines
- Work with big data technologies
- Optimize data storage and retrieval
- Collaborate with data scientists and analysts

Requirements:
- 4+ years of data engineering experience
- Strong SQL and Python skills
- Experience with Apache Spark
- Knowledge of AWS data services (S3, Redshift, Glue)
- ETL/ELT pipeline experience

Bonus points:
- Experience with Airflow
- Knowledge of streaming data (Kafka, Kinesis)
- Data warehouse design experience
- Machine learning pipeline experience

Compensation:
- Base salary: $130K - $170K
- Annual bonus
- Full benefits package
`,
      job_required_skills: ['Python', 'SQL', 'Spark', 'AWS', 'ETL', 'Data Pipeline'],
      job_required_experience: {
        required_experience_in_months: 48,
        experience_mentioned: true
      },
      job_is_remote: true,
      job_employment_type: 'FULLTIME'
    }
  },

  // Search parameters
  searchParams: {
    basic: {
      jobTitle: 'software engineer',
      location: 'San Francisco, CA'
    },
    
    withFilters: {
      jobTitle: 'backend engineer',
      location: 'Remote',
      datePosted: 'week',
      remote: true,
      employmentTypes: ['FULLTIME'],
      keywords: ['python', 'aws']
    },
    
    seniorLevel: {
      jobTitle: 'senior software engineer',
      location: 'New York, NY',
      jobRequirements: ['more_than_3_years_exp']
    }
  },

  // AI match responses
  aiResponses: {
    strongMatch: {
      matches: [{
        jobId: 'job_123',
        score: 92,
        matchLabel: 'STRONG MATCH',
        matchReasons: [
          '8+ years experience exceeds requirement',
          'Expert in all required technologies (Node.js, AWS, Docker)',
          'Previous microservices architecture experience',
          'Leadership and mentoring background'
        ],
        missingSkills: ['GraphQL'],
        keyStrengths: ['Cloud Architecture', 'Team Leadership', 'Performance Optimization']
      }]
    },
    
    goodMatch: {
      matches: [{
        jobId: 'job_456',
        score: 75,
        matchLabel: 'GOOD MATCH',
        matchReasons: [
          'Strong React and JavaScript skills',
          'Experience with state management',
          'Frontend development expertise'
        ],
        missingSkills: ['TypeScript', 'Next.js'],
        keyStrengths: ['React', 'UI Development', 'Responsive Design']
      }]
    },
    
    fairMatch: {
      matches: [{
        jobId: 'job_789',
        score: 55,
        matchLabel: 'FAIR MATCH',
        matchReasons: [
          'Some Python experience',
          'Basic database knowledge'
        ],
        missingSkills: ['Spark', 'AWS', 'Data Pipeline', 'ETL'],
        keyStrengths: ['Python', 'SQL Basics']
      }]
    }
  }
};