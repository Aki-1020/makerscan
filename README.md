

# MakerScan - Block Explorer for MakerCoin

Ubuntu 20.04 Install Instructions

Install MongoDB:
```
curl -fsSL https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
sudo apt update
sudo apt install mongodb-org
sudo systemctl start mongod.service
```

Install Redis Server:
```
sudo apt update
sudo apt install redis-server
```

Install NodeJS:
```
curl -fsSL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install PM2
```
npm install -g pm2
```

Install packages
```
npm install
```

Start the blockchain parser:
```
pm2 start parser.js
```

Start the web server:
```
pm2 start app.js
```
