import asyncio
import logging
import aio_pika
from services.rabbit_settings import get_rabbit_settings

logger = logging.getLogger(__name__)

_rabbit_status = {
    "available": False,
    "last_error": "RabbitMQ no inicializado",
}

RABBIT_QUEUES = [
    "MatriculaRealizada", "MatriculaAnulada", "MatriculaRecuperada",
    "MatriculaDesestimada", "MatriculaReiniciada", "MatriculaAmpliacionReiniciada",
    "MatriculaAmpliacionAnulada", "MatriculaAmpliacionDesestimada",
    "MatriculaAmpliacionRecuperada", "MatriculaAmpliacionRealizada",
    "MatriculaVariacionAnulada", "MatriculaVariacionRealizada",
    "MatriculaVariacionRecuperada", "ClienteModificado", "DefensaModificada",
    "ActaArchivada", "CuentaBloqueada", "CuentaDesbloqueada",
    "MatriculaPeriodoAcademicoCambiado", "DocumentoFirmado",
    "MatriculaVariacionReiniciada", "MatriculaVariacionDesestimada",
    "NotaFinalGenerada", "NotaDesglosadaModificada", "ExpedientesMigrados",
    "ProgresoEstudianteActualizado", "DiligenciaResuelta", "ConvocatoriasTFECerradas",
    "DiligenciaCerrada", "ActaCancelada", "FechaPagoTituloSolicitado",
]

async def ensure_queues_exist(retries: int = 5, delay: int = 5) -> bool:
    """
    Asegura que todas las colas de desarrollo existan en el RabbitMQ local.
    Intenta conectar varias veces si RabbitMQ no está listo.
    """
    settings = get_rabbit_settings()
    if not settings.enabled:
        _rabbit_status["available"] = False
        _rabbit_status["last_error"] = "RabbitMQ deshabilitado por RABBITMQ_ENABLED=false"
        logger.info(_rabbit_status["last_error"])
        return False

    rabbit_url = settings.url
    retries = settings.retries if retries == 5 else retries
    delay = settings.retry_delay_seconds if delay == 5 else delay
    
    for i in range(retries):
        try:
            logger.info(f"Intentando conectar a RabbitMQ para inicializar colas (intento {i+1}/{retries})...")
            connection = await aio_pika.connect_robust(rabbit_url)
            
            async with connection:
                channel = await connection.channel()
                
                for queue_name in RABBIT_QUEUES:
                    await channel.declare_queue(queue_name, durable=True)
                    logger.debug(f"Cola asegurada: {queue_name}")
                
                logger.info(f"Inicialización de RabbitMQ completada: {len(RABBIT_QUEUES)} colas procesadas.")
                _rabbit_status["available"] = True
                _rabbit_status["last_error"] = None
                return True
                
        except Exception as e:
            _rabbit_status["available"] = False
            _rabbit_status["last_error"] = str(e)
            logger.warning(f"No se pudo conectar a RabbitMQ: {str(e)}. Reintentando en {delay}s...")
            await asyncio.sleep(delay)
            
    _rabbit_status["available"] = False
    _rabbit_status["last_error"] = "No se pudo inicializar las colas tras varios intentos"
    logger.error("No se pudo inicializar las colas de RabbitMQ tras varios intentos.")
    return False


def rabbit_status() -> dict[str, object | None]:
    return dict(_rabbit_status)
