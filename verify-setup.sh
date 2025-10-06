#!/bin/bash

echo "========================================="
echo "VERIFICAÇÃO DO SISTEMA"
echo "========================================="
echo ""

# Verificar .env
echo "1. Verificando arquivo .env..."
if [ -f ".env" ]; then
    URL=$(grep "VITE_SUPABASE_URL" .env | cut -d'=' -f2)
    if [[ "$URL" == *"ezfpijdjvarbrwhiutek"* ]]; then
        echo "   ✓ .env CORRETO (Supabase Real)"
    else
        echo "   ✗ .env ERRADO! Contém: $URL"
        echo "   Deve conter: https://ezfpijdjvarbrwhiutek.supabase.co"
        exit 1
    fi
else
    echo "   ✗ Arquivo .env não encontrado!"
    exit 1
fi

echo ""
echo "2. Credenciais de login:"
echo "   Matrícula: 9999"
echo "   Senha: 684171"

echo ""
echo "========================================="
echo "✓ SISTEMA CONFIGURADO CORRETAMENTE"
echo "========================================="
echo ""
echo "Próximos passos:"
echo "1. Reinicie o servidor: npm run dev"
echo "2. Hard refresh no navegador: Ctrl+Shift+R"
echo "3. Faça login com matrícula 9999 e senha 684171"
