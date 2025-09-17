services:
  - type: web
    name: wavierwire
    env: node
    region: oregon
    plan: starter
    buildCommand: |
      # Update system packages
      sudo apt-get update
      
      # Install R and required system dependencies
      sudo apt-get install -y r-base r-base-dev libcurl4-openssl-dev libssl-dev libxml2-dev
      
      # Install R packages
      sudo R -e "install.packages(c('ffscrapr', 'jsonlite', 'dplyr'), repos='http://cran.r-project.org', dependencies=TRUE)"
      
      # Navigate to server directory and install Node dependencies
      cd server && npm install
      
    startCommand: cd server && npm start
    
    # Root directory for the service
    rootDir: ./
    
    envVars:
      - key: NODE_ENV
        value: production
        
    # Make sure these environment variables are set in your Render dashboard
    # - SWID: your ESPN SWID cookie
    # - ESPN_S2: your ESPN S2 cookie  
    # - DATABASE_URL: your PostgreSQL connection string
    # - LEAGUE_ID: your ESPN league ID (optional)
