import asyncio
import logging
import os
import aio_pika

logger = logging.getLogger(__name__)

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

async def ensure_queues_exist(retries: int = 5, delay: int = 5):
    """
    Asegura que todas las colas de desarrollo existan en el RabbitMQ local.
    Intenta conectar varias veces si RabbitMQ no está listo.
    """
    rabbit_url = os.environ.get("RABBITMQ_URL", "amqp://invitado:secreta@rabbitmq:5672/")
    
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
                return True
                
        except Exception as e:
            logger.warning(f"No se pudo conectar a RabbitMQ: {str(e)}. Reintentando en {delay}s...")
            await asyncio.sleep(delay)
            
    logger.error("No se pudo inicializar las colas de RabbitMQ tras varios intentos.")
    return False
