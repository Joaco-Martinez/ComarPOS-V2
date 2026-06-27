/**
 * Servicio de clientes.
 * Logica extraida a sub-modulos para reducir la superficie de cambio:
 *   - client/client.helpers.ts      → tipos + normalizacion compartida
 *   - client/client.registration.ts → alta (admin y autoregistro de tienda)
 *   - client/client.auth.ts         → recuperacion/reseteo de contraseña
 *   - client/client.crud.ts         → lectura, edicion y baja
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4).
 */
import { createClient, registerStoreClient } from "./client/client.registration";
import { requestPasswordReset, resetPassword } from "./client/client.auth";
import { getClients, getClientById, updateClient, deleteClient } from "./client/client.crud";

export const clientService = {
  createClient,
  registerStoreClient,
  requestPasswordReset,
  resetPassword,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
};
