export const EMPRESA = 'POSITIVO S+ IT SOLUTIONS S.A.S';
export const NIT_EMPRESA = 'NIT 900.675.394-8';

export const CODIGO_DOC = 'A-ACT-00429';
export const VERSION_DOC = '2.0';
export const FECHA_DOC = '10/01/2025';

export interface PlantillaActa {
  asunto: string;
  titulo: string;
  intro: string[];
  campos: { nombres: string; cedula: string; correo: string; cargo: string; cr: string; lider: string; fecha: string };
  legal: string[];
  firmaAccion: string;
}

const LEGAL_COMUN = [
  'En consecuencia, serán asumidos por mí, cualquier daño o pérdida que les llegaré a causar a los mismos, debido a mi negligencia en el uso de dichos activos o por el incumplimiento de los instructivos relacionados con su uso y conservación. Así mismo, reconozco y acepto que el mal uso de las herramientas de trabajo que me son entregadas eventualmente podrá constituir una falta grave que podría dar lugar a la terminación del contrato de trabajo con justa causa.',
  'Me comprometo a informar oportunamente a la Gerencia, al Departamento de Sistemas o al área encargada, sobre cualquier daño, avería, pérdida o robo de los activos relacionados y sobre cualquier situación que ponga en riesgo los bienes relacionados.',
  'En caso de que llegare a producirse mi desvinculación laboral de la empresa con la que actualmente tengo un contrato individual de trabajo, AUTORIZO expresamente a la sociedad comercial POSITIVO S+ IT SOLUTIONS S.A.S., identificada con NIT 900.675.394-8, para que deduzca de mi salario, bonificaciones, prestaciones sociales, liquidaciones o de cualquier dinero que se genere a mi favor derivado de la relación laboral que culmina, el valor pendiente por pagar o el valor total si no fueron devueltos las herramientas aquí descritas al momento de finalizar la relación laboral; de no sanear completamente la obligación autorizo para que el dinero en mención sea abonado a la obligación crediticia pendiente; lo anterior de conformidad con los Artículos 149 y 150 del Código Sustantivo de Trabajo.',
  'Así mismo, AUTORIZO AL FONDO DE CESANTÍAS para que retenga a favor de la sociedad comercial POSITIVO S+ IT SOLUTIONS S.A.S., identificada con NIT 900.675.394-8, la suma pendiente de pago; lo anterior solo es exigible en el evento en que con la retención efectuada por la empresa no se alcance a cubrir la totalidad de la obligación; esto de conformidad con el Artículo 29 del Decreto 1063 de 1991.',
  'El presente acuerdo no vulnerará el DERECHO AL MÍNIMO VITAL, el cual se encuentra estipulado en la legislación COLOMBIANA con el equivalente a un (01) S.M.L.M.V.',
];

export const ACTA_ASIGNACION: PlantillaActa = {
  asunto: 'ASIGNACIÓN',
  titulo: 'ACTA HERRAMIENTAS DE TRABAJO PARA COLABORADORES',
  intro: [
    'Con el objetivo de mantener un adecuado control de los activos, herramientas e implementos que son propiedad de POSITIVO S+ IT SOLUTIONS S.A.S y que han sido entregados para la gestión de su labor, se informa que absolutamente, todos los movimientos (cambios, ingresos o salidas), deberán ser notificados sin falta y con la debida oportunidad al área de Service Desk o si es línea celular o móvil al área Administrativa y Financiera.',
    'Adicionalmente cualquier cambio de ubicación o dependencia debe ser reportado al área de Service Desk, para que éste tome decisiones sobre la reubicación del elemento.',
    'Importante: El área de Service Desk puede disponer del elemento en cualquier momento.',
  ],
  campos: {
    nombres: 'NOMBRES COMPLETOS', cedula: 'IDENTIFICACIÓN', correo: 'CORREO CORPORATIVO',
    cargo: 'CARGO', cr: 'CENTRO DE RESULTADOS', lider: 'LÍDER INMEDIATO', fecha: 'FECHA DE ASIGNACIÓN',
  },
  legal: [
    'Como empleado de POSITIVO S+ IT SOLUTIONS S.A.S., declaro que los activos relacionados en el presente documento están bajo mi responsabilidad y como tal les daré un uso adecuado, responsable y aceptable para el desempeño eficiente de mis funciones. El uso que daré a estas herramientas se encuentra de acuerdo con la destinación prevista para cada uno de ellos, según los fines establecidos por la empresa.',
    ...LEGAL_COMUN,
  ],
  firmaAccion: 'Entrega',
};

export const ACTA_DEVOLUCION: PlantillaActa = {
  asunto: 'DEVOLUCIÓN',
  titulo: 'ACTA HERRAMIENTAS DE TRABAJO PARA ASOCIADOS',
  intro: [
    'Con el objetivo de quedar a paz y salvo en todo concepto de entrega de elementos y mantener un adecuado control de los activos, herramientas e implementos que son propiedad de POSITIVO S+ IT SOLUTIONS S.A.S, que fueron entregados para la gestión de mi labor, se entregan los siguientes elementos:',
  ],
  campos: {
    nombres: 'NOMBRES COMPLETOS', cedula: 'CÉDULA', correo: 'CORREO',
    cargo: 'CARGO', cr: 'CR', lider: 'LÍDER INMEDIATO', fecha: 'FECHA DE ENTREGA',
  },
  legal: LEGAL_COMUN,
  firmaAccion: 'Recibe',
};

export function plantillaActa(tipo: string): PlantillaActa {
  return tipo === 'DEVOLUCION' ? ACTA_DEVOLUCION : ACTA_ASIGNACION;
}
