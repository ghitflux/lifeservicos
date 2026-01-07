#!/usr/bin/env node

/**
 * Script para detectar automaticamente o IP local da máquina
 * para configurar o EXPO_PUBLIC_API_URL corretamente
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignora loopback e endereços IPv6
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          interface: name,
          address: iface.address,
        });
      }
    }
  }

  return addresses;
}

function updateEnvFile(ip) {
  const envPath = path.join(__dirname, '..', '.env');
  const apiUrl = `http://${ip}:8000`;

  const envContent = `# Database
DATABASE_URL="postgresql://applife:applife_password@localhost:5432/applife_db"

# API - Backend do life-system (porta 8000)
# O app mobile se conecta ao backend web do life-system
# Para Expo Go, precisa usar o IP local da máquina
# IP atual: ${ip} (detectado automaticamente em ${new Date().toISOString().split('T')[0]})
EXPO_PUBLIC_API_URL="${apiUrl}"
API_URL="${apiUrl}"
`;

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`✅ Arquivo .env atualizado com IP: ${ip}`);
}

function main() {
  console.log('🔍 Detectando IPs locais da máquina...\n');

  const addresses = getLocalIP();

  if (addresses.length === 0) {
    console.log('❌ Nenhum IP local encontrado!');
    console.log('   Verifique sua conexão de rede.');
    process.exit(1);
  }

  console.log('📡 IPs encontrados:\n');
  addresses.forEach((addr, index) => {
    console.log(`   ${index + 1}. ${addr.address} (${addr.interface})`);
  });

  // Priorizar Wi-Fi
  const wifiInterface = addresses.find(addr =>
    addr.interface.toLowerCase().includes('wi-fi') ||
    addr.interface.toLowerCase().includes('wlan') ||
    addr.interface.toLowerCase().includes('wireless')
  );

  const selectedIP = wifiInterface ? wifiInterface.address : addresses[0].address;

  console.log(`\n✨ IP selecionado: ${selectedIP}`);
  console.log(`   Interface: ${wifiInterface ? wifiInterface.interface : addresses[0].interface}`);

  const apiUrl = `http://${selectedIP}:8000`;

  console.log(`\n📝 Configuração da API:`);
  console.log(`   EXPO_PUBLIC_API_URL="${apiUrl}"`);
  console.log(`   API_URL="${apiUrl}"`);

  // Perguntar se quer atualizar o .env
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('\n❓ Deseja atualizar o arquivo .env automaticamente? (s/n): ', (answer) => {
    if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim' || answer.toLowerCase() === 'y') {
      updateEnvFile(selectedIP);
      console.log('\n🎉 Configuração concluída!');
      console.log('\n📱 Próximos passos:');
      console.log('   1. Certifique-se de que o backend está rodando na porta 8000');
      console.log('   2. Execute: npm start (ou npx expo start)');
      console.log('   3. Escaneie o QR code no Expo Go');
      console.log('   4. O app deve conectar automaticamente ao backend\n');
    } else {
      console.log('\n📋 Copie a configuração acima e atualize manualmente o arquivo .env\n');
    }
    readline.close();
  });
}

main();
