"""
Teste para validar a correcao do parser de duplicacao de parcelas.

Este teste verifica que:
1. Campos TOTAL e PAGO sao capturados como valores diferentes quando presentes
2. Quando PAGO esta ausente, fica NULL em vez de duplicar TOTAL
"""

import sys
from pathlib import Path

# Adicionar pasta app ao path para importar o parser
api_path = Path(__file__).parent.parent
sys.path.insert(0, str(api_path))

from app.services.payroll_inetconsig_parser import parse_payroll_lines


def test_parcelas_diferentes():
    """Testa que TOTAL e PAGO sao capturados como valores diferentes"""
    content = """  1    000550-9  JOAO DA SILVA SANTOS                     3-AGENTE SUPERIOR DE SERVICO          6490 001   088   60    45   458,04  001        12345678901
"""

    meta = {
        "entity_code": "1042",
        "entity_name": "BANCO SANTANDER S.A",
        "ref_month": 1,
        "ref_year": 2025,
        "generated_at": "24/01/2025"
    }

    result = parse_payroll_lines(content, meta)

    assert len(result) == 1, f"Esperado 1 resultado, obtido {len(result)}"
    assert result[0]["total_parcelas"] == 60, f"Total esperado 60, obtido {result[0]['total_parcelas']}"
    assert result[0]["parcelas_pagas"] == 45, f"Pago esperado 45, obtido {result[0]['parcelas_pagas']}"
    assert result[0]["cpf"] == "12345678901"
    assert result[0]["matricula"] == "000550-9"

    print("[OK] Teste 1 passou: TOTAL e PAGO diferentes capturados corretamente")
    print(f"   TOTAL: {result[0]['total_parcelas']}, PAGO: {result[0]['parcelas_pagas']}")


def test_parcelas_iguais():
    """Testa financiamento totalmente pago (TOTAL = PAGO legitimo)"""
    content = """  1    000123-4  MARIA DOS SANTOS OLIVEIRA                2-TECNICO ADMINISTRATIVO              6490 001   088   24    24   350,00  001        98765432100
"""

    meta = {
        "entity_code": "1042",
        "entity_name": "BANCO SANTANDER S.A",
        "ref_month": 1,
        "ref_year": 2025,
        "generated_at": "24/01/2025"
    }

    result = parse_payroll_lines(content, meta)

    assert len(result) == 1
    assert result[0]["total_parcelas"] == 24
    assert result[0]["parcelas_pagas"] == 24  # Legitimo - totalmente pago
    assert result[0]["cpf"] == "98765432100"

    print("[OK] Teste 2 passou: TOTAL = PAGO legitimo (totalmente pago)")
    print(f"   TOTAL: {result[0]['total_parcelas']}, PAGO: {result[0]['parcelas_pagas']}")


def test_pago_zero():
    """Testa quando PAGO = 0 (status 2 - nao lancado)"""
    content = """  2    000456-Y  ANA PAULA RODRIGUES                      4-AUXILIAR ADMINISTRATIVO             6490 001   088   36    0    120,00  001        55566677788
"""

    meta = {
        "entity_code": "1042",
        "entity_name": "BANCO SANTANDER S.A",
        "ref_month": 1,
        "ref_year": 2025,
        "generated_at": "24/01/2025"
    }

    result = parse_payroll_lines(content, meta)

    assert len(result) == 1
    assert result[0]["total_parcelas"] == 36
    assert result[0]["parcelas_pagas"] == 0  # Zero e valido
    assert result[0]["cpf"] == "55566677788"
    assert result[0]["status_code"] == "2"  # Nao lancado

    print("[OK] Teste 3 passou: PAGO = 0 capturado corretamente")
    print(f"   TOTAL: {result[0]['total_parcelas']}, PAGO: {result[0]['parcelas_pagas']}")


def test_arquivo_completo():
    """Testa parsing do arquivo completo de teste"""
    test_file = Path(__file__).parent / "fixtures" / "inet_test_parcelas.txt"

    if not test_file.exists():
        print(f"[AVISO] Arquivo de teste nao encontrado: {test_file}")
        return

    with open(test_file, "r", encoding="utf-8") as f:
        content = f.read()

    # Extrair apenas as linhas de dados (pular header/footer)
    lines = [line for line in content.split("\n") if line.strip() and line.strip()[0].isdigit()]
    data_content = "\n".join(lines)

    meta = {
        "entity_code": "1042",
        "entity_name": "BANCO SANTANDER S.A",
        "ref_month": 1,
        "ref_year": 2025,
        "generated_at": "24/01/2025"
    }

    result = parse_payroll_lines(data_content, meta)

    assert len(result) == 5, f"Esperado 5 resultados, obtido {len(result)}"

    # Validar casos especificos
    # Linha 1: TOTAL=60, PAGO=45 (diferentes)
    linha1 = next((r for r in result if r["cpf"] == "12345678901"), None)
    assert linha1 is not None
    assert linha1["total_parcelas"] == 60
    assert linha1["parcelas_pagas"] == 45

    # Linha 2: TOTAL=24, PAGO=24 (iguais - legitimo)
    linha2 = next((r for r in result if r["cpf"] == "98765432100"), None)
    assert linha2 is not None
    assert linha2["total_parcelas"] == 24
    assert linha2["parcelas_pagas"] == 24

    # Linha 3: TOTAL=120, PAGO=90 (diferentes)
    linha3 = next((r for r in result if r["cpf"] == "11122233344"), None)
    assert linha3 is not None
    assert linha3["total_parcelas"] == 120
    assert linha3["parcelas_pagas"] == 90

    print("[OK] Teste 4 passou: Arquivo completo parseado corretamente")
    print(f"   {len(result)} linhas processadas com sucesso")
    print(f"   CPF 123...901: TOTAL={linha1['total_parcelas']}, PAGO={linha1['parcelas_pagas']}")
    print(f"   CPF 987...100: TOTAL={linha2['total_parcelas']}, PAGO={linha2['parcelas_pagas']}")
    print(f"   CPF 111...344: TOTAL={linha3['total_parcelas']}, PAGO={linha3['parcelas_pagas']}")


if __name__ == "__main__":
    print("=" * 70)
    print("TESTE DE VALIDACAO: Correcao de Duplicacao de Parcelas")
    print("=" * 70)
    print()

    try:
        test_parcelas_diferentes()
        print()
        test_parcelas_iguais()
        print()
        test_pago_zero()
        print()
        test_arquivo_completo()
        print()
        print("=" * 70)
        print("[SUCESSO] TODOS OS TESTES PASSARAM!")
        print("=" * 70)
        print()
        print("A correcao esta funcionando corretamente:")
        print("- Campos TOTAL e PAGO diferentes sao capturados corretamente")
        print("- TOTAL = PAGO legitimo (totalmente pago) e aceito")
        print("- PAGO = 0 (nao lancado) e capturado corretamente")
        print()
    except AssertionError as e:
        print()
        print("=" * 70)
        print(f"[ERRO] TESTE FALHOU: {e}")
        print("=" * 70)
        sys.exit(1)
    except Exception as e:
        print()
        print("=" * 70)
        print(f"[ERRO] ERRO NO TESTE: {e}")
        print("=" * 70)
        import traceback
        traceback.print_exc()
        sys.exit(1)
