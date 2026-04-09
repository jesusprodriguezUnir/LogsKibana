export interface RabbitFieldDef {
  key: string;       // El nombre de la columna para añadir al qs (ej. Notas_IdAlumno) sin el "payload_"
  label: string;     // Etiqueta UI 
  type: "text" | "number" | "boolean";
}

export const RABBIT_SCHEMAS: Record<string, RabbitFieldDef[]> = {
  NotaFinalGenerada: [
    { key: "Plataforma", label: "Plataforma", type: "text" },
    { key: "Provisional", label: "Provisional", type: "boolean" },
    { key: "IdCurso", label: "Id Curso", type: "number" },
    { key: "IdUsuarioPublicadorConfirmador", label: "Id Usuario Pub", type: "number" },
    { key: "IdActa", label: "Id Acta", type: "number" },
    { key: "Notas_IdAlumno", label: "Id Alumno (nota)", type: "number" },
    { key: "Notas_Convocatoria", label: "Convocatoria (nota)", type: "text" },
  ],
  DiligenciaCerrada: [
    { key: "IdActa", label: "Id Acta", type: "number" },
    { key: "IdDiligencia", label: "Id Diligencia", type: "number" },
    { key: "FechaCierre", label: "Fecha Cierre", type: "text" },
    { key: "NaturalezaDiligencia_Id", label: "Naturaleza Id", type: "number" },
    { key: "NaturalezaDiligencia_Descripcion", label: "Naturaleza", type: "text" },
  ],
  NotaDesglosadaModificada: [
    { key: "IdAlumno", label: "Id Alumno", type: "number" },
    { key: "IdEstudio", label: "Id Estudio", type: "number" },
    { key: "IdAsignatura", label: "Id Asignatura", type: "number" },
    { key: "IdCurso", label: "Id Curso", type: "number" },
    { key: "AnyoAcademico", label: "Año Académico", type: "text" },
  ],
  MatriculaRealizada: [
    { key: "UniversidadIdIntegracion", label: "Universidad", type: "text" },
    { key: "MatriculaIdIntegracion", label: "Id Matrícula", type: "text" },
    { key: "EsMatriculaNuevoIngreso", label: "Nuevo Ingreso", type: "boolean" },
    { key: "AlumnoIdIntegracion", label: "Id Alumno", type: "text" },
    { key: "NumeroDocumento", label: "Nº Documento", type: "text" },
    { key: "IdPlanOfertado", label: "Id Plan", type: "number" },
    { key: "IdViaAcceso", label: "Id Vía Acceso", type: "number" },
    { key: "OperacionVentaIdIntegracion", label: "Id Op. Venta", type: "text" },
  ],
  ActaArchivada: [
    { key: "IdActa", label: "Id Acta", type: "number" },
    { key: "IdClase", label: "Id Clase", type: "number" },
    { key: "TipoEvaluacion", label: "Tipo Evaluación", type: "text" },
    { key: "IdAlumnoIntegracion", label: "Id Alumno", type: "text" },
    { key: "OrigenActa", label: "Origen Acta", type: "text" },
  ]
};
