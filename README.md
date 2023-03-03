

# Pandascan - Block Explorer for Pandanite

Ubuntu 20.04 Install Instructions

Install MongoDB:
```
curl -fsSL https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
sudo apt update
sudo apt install mongodb-org
sudo systemctl start mongod.service
```

Install Pandanite Node:
```
sudo apt-get update
sudo apt-get -y install make cmake automake libtool python3-pip libleveldb-dev curl git
sudo update-alternatives --install /usr/bin/python python /usr/bin/python3.8 1
sudo pip3 install conan==1.59
git clone https://github.com/pandanite-crypto/pandanite
cd pandanite
mkdir build
cd build
conan install .. --build=missing
cd ..
cmake .
make server
./bin/server
```

Install NodeJS:
```
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
