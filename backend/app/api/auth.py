import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from app.models import User
from app.schemas import Token, UserLogin, UserRegister, UserResponse

router = APIRouter()
public_router = APIRouter(prefix="/mobile", tags=["mobile-sync"])
security = HTTPBearer()

async def sync_user_with_web(user_data: UserRegister):
    """
    Envia o cadastro para o backend web (life-system) para que o cliente apareça no módulo Life Mobile.
    Levanta HTTPException em caso de erro para evitar cadastros divergentes entre os bancos.
    """
    base_url = (settings.WEB_API_URL or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=500, detail="WEB_API_URL não configurada para sincronizar com o sistema web")

    url = f"{base_url}/mobile/register"
    payload = {
        "name": user_data.name,
        "email": user_data.email,
        "password": user_data.password,
        "cpf": user_data.cpf,
        "phone": user_data.phone,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
    except httpx.RequestError as exc:  # erro de rede/dns/timeout
        raise HTTPException(
            status_code=502,
            detail=f"Falha ao contatar o backend web ({exc})"
        ) from exc

    # Tratamento de respostas
    if response.status_code in (200, 201):
        return

    # Extrai detalhe retornado pela API web (se houver)
    detail = None
    try:
        detail = response.json().get("detail")
    except Exception:
        detail = response.text or None

    if response.status_code == 400:
        raise HTTPException(status_code=400, detail=detail or "Email já cadastrado no sistema web")

    raise HTTPException(
        status_code=502,
        detail=detail or f"Erro ao sincronizar cadastro com o sistema web (status {response.status_code})"
    )

async def register_user(user_data: UserRegister, db: Session) -> User:
    """Cria usuário local e sincroniza com o backend web."""
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Primeiro garante sincronização com o sistema web para manter os bancos alinhados
    await sync_user_with_web(user_data)

    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=hashed_password,
        cpf=user_data.cpf,
        phone=user_data.phone
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    return await register_user(user_data, db)

@public_router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def public_register(user_data: UserRegister, db: Session = Depends(get_db)):
    """
    Endpoint compatível com o life-system (/mobile/register).
    Útil para quando o app mobile estiver apontando para o backend local desta aplicação.
    """
    return await register_user(user_data, db)

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user
