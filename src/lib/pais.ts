/**
 * El país de quien mira, aplicado a lo que mira.
 *
 * Reparto de papeles, que es lo que hay que tener claro antes de tocar esto:
 *
 *   · `perfil_paises` (y la RLS detrás) decide QUÉ PUEDE VER cada persona. Eso
 *     es seguridad y no se toca desde aquí.
 *   · `perfiles.pais_id` —lo que esta pieza usa— decide QUÉ VE PRIMERO: es una
 *     preferencia que cada quien edita en Ajustes. Abre las pantallas filtradas
 *     por su país y pone sus sedes al principio de las listas.
 *
 * De ahí que el filtro sea SIEMPRE visible y tenga "Todos los países": es una
 * comodidad, no un candado, y quien opera en dos países tiene que poder ver los
 * dos sin ir a cambiar su perfil. Si esto ocultara datos en silencio, el día que
 * alguien buscara un equipo de otra ciudad creería que se perdió.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listPaises, listSedes } from '@/lib/api';
import { useApp } from '@/store/useApp';
import type { SelectOption } from '@/components/ui/Select';
import type { Pais, Sede } from '@/types';

/** Valor del filtro cuando no se filtra por país. */
export const TODOS_LOS_PAISES = '';

/** Sedes del país indicado; todas si no hay país. */
export function sedesDePais(sedes: Sede[], paisId: string | null | undefined): Sede[] {
  if (!paisId) return sedes;
  return sedes.filter((s) => s.pais_id === paisId);
}

/**
 * Las sedes del país propio primero, el resto después, cada bloque por nombre.
 *
 * Para los desplegables de sede: quien trabaja en Colombia elige una sede
 * colombiana el 99 % de las veces, y no tiene por qué bajar por toda Brasil
 * para llegar a Bogotá. No se esconde nada — solo cambia el orden.
 */
export function ordenarSedesPorPais(sedes: Sede[], paisId: string | null | undefined): Sede[] {
  if (!paisId) return sedes;
  return [...sedes].sort((a, b) => {
    const pa = Number(a.pais_id === paisId);
    const pb = Number(b.pais_id === paisId);
    return pb - pa || a.nombre.localeCompare(b.nombre);
  });
}

/**
 * El país que hay que dar por defecto a esta persona.
 *
 * Primero el que ella misma eligió; si no lo ha elegido (o eligió uno que ya no
 * está en su alcance), se deduce: el país de su sede principal, o el único país
 * que tiene asignado. Devuelve null cuando de verdad no se puede saber, y en
 * ese caso las pantallas abren sin filtro, como siempre.
 */
export function paisPreferido(
  perfilPaisId: string | null | undefined,
  sedePrincipal: string | null | undefined,
  sedes: Sede[],
  paisesDisponibles: string[],
): string | null {
  const permitido = (p: string | null | undefined) =>
    !!p && (!paisesDisponibles.length || paisesDisponibles.includes(p));

  if (permitido(perfilPaisId)) return perfilPaisId!;

  const dePerfil = sedes.find((s) => s.id === sedePrincipal)?.pais_id;
  if (permitido(dePerfil)) return dePerfil!;

  return paisesDisponibles.length === 1 ? paisesDisponibles[0] : null;
}

export interface FiltroPais {
  /** País seleccionado, o '' para todos. */
  valor: string;
  setValor: (v: string) => void;
  /** Opciones del desplegable, "Todos los países" incluido. */
  opciones: SelectOption[];
  /** Si false, no hay más de un país que elegir y el filtro sobra en pantalla. */
  mostrar: boolean;
  /** ¿Hay filtro puesto? Para el botón de "limpiar filtros" de cada pantalla. */
  activo: boolean;
  /** ¿Este registro entra? Lo que no tiene sede entra siempre (ver abajo). */
  incluye: (sedeId: string | null | undefined) => boolean;
  /** Nombre del país seleccionado, para las pastillas de filtros activos. */
  etiqueta: string | null;
  /** Todas las sedes (ya cargadas aquí), por si la pantalla las necesita. */
  sedes: Sede[];
  paises: Pais[];
  /** El país propio, aunque el filtro esté en "todos". Para ordenar listas. */
  paisPropio: string | null;
}

/**
 * Filtro por país para un listado, ya arrancado en el país de quien mira.
 *
 * Las pantallas lo usan así:
 *
 *   const pais = useFiltroPais();
 *   ...items.filter((x) => pais.incluye(x.sede_id))
 *
 * Los registros SIN sede pasan siempre el filtro a propósito: un equipo que
 * todavía no está en ninguna ciudad no es "de otro país", es de nadie, y es
 * justo el que hay que poder encontrar para asignarlo. Es el mismo criterio que
 * ya usan Líneas y Tickets con las sedes.
 */
export function useFiltroPais(): FiltroPais {
  const { t } = useTranslation();
  const { perfil, misPaises, operaTodasLasSedes } = useApp();
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const { data: paises = [] } = useQuery({ queryKey: ['paises'], queryFn: listPaises });

  // Qué países puede elegir: todos si opera sin fronteras (ADMIN y Jefe), y si
  // no, los suyos. `misPaises` puede llegar vacío en un perfil antiguo asignado
  // por sedes, así que en ese caso se deducen de las sedes que sí tiene.
  const disponibles = useMemo(() => {
    if (operaTodasLasSedes()) return paises.map((p) => p.id);
    if (misPaises.length) return misPaises;
    const propios = new Set<string>();
    for (const s of sedes) if (s.id === perfil?.sede_id) propios.add(s.pais_id);
    return [...propios];
  }, [operaTodasLasSedes, paises, misPaises, sedes, perfil?.sede_id]);

  const paisPropio = useMemo(
    () => paisPreferido(perfil?.pais_id, perfil?.sede_id, sedes, disponibles),
    [perfil?.pais_id, perfil?.sede_id, sedes, disponibles],
  );

  const [valor, setValor] = useState('');
  const tocado = useRef(false);
  const aplicado = useRef<string | null>(null);

  // El país propio se aplica en cuanto se sabe (los catálogos llegan después
  // del primer pintado) y también si la persona lo cambia en Ajustes con la
  // pantalla abierta. Lo que nunca se pisa es una elección manual.
  useEffect(() => {
    // `disponibles` vacío significa "los catálogos aún no han llegado", no "no
    // hay países": aplicar el filtro ahí dejaría la pantalla filtrada por un
    // país cuyo desplegable todavía no se pinta, y nadie podría quitarlo.
    if (tocado.current || !disponibles.length || !paisPropio || aplicado.current === paisPropio) return;
    aplicado.current = paisPropio;
    setValor(paisPropio);
  }, [paisPropio, disponibles.length]);

  const elegir = useCallback((v: string) => { tocado.current = true; setValor(v); }, []);

  const opciones = useMemo<SelectOption[]>(() => {
    const permitidos = new Set(disponibles);
    return [
      { value: TODOS_LOS_PAISES, label: `${t('common.country')}: ${t('common.all')}` },
      ...paises
        .filter((p) => permitidos.has(p.id))
        .map((p) => ({
          value: p.id,
          label: p.nombre,
          description: p.id === paisPropio ? t('common.myCountry') : undefined,
        })),
    ];
  }, [paises, disponibles, paisPropio, t]);

  const sedesDelPais = useMemo(() => {
    if (!valor) return null;
    return new Set(sedes.filter((s) => s.pais_id === valor).map((s) => s.id));
  }, [sedes, valor]);

  const incluye = useCallback(
    (sedeId: string | null | undefined) => !sedesDelPais || !sedeId || sedesDelPais.has(sedeId),
    [sedesDelPais],
  );

  // Memorizado porque las pantallas lo meten tal cual en las dependencias de
  // sus `useMemo` de filtrado: un objeto nuevo por render volvería a recorrer
  // dos mil filas en cada tecla.
  return useMemo<FiltroPais>(() => ({
    valor,
    setValor: elegir,
    opciones,
    mostrar: disponibles.length > 1,
    activo: !!valor,
    incluye,
    etiqueta: paises.find((p) => p.id === valor)?.nombre ?? null,
    sedes,
    paises,
    paisPropio,
  }), [valor, elegir, opciones, disponibles.length, incluye, paises, sedes, paisPropio]);
}
