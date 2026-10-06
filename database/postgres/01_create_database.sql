-- =====================================================================
--  01 - Criação do usuário e do banco (PostgreSQL)
--  Executar UMA vez, conectado como superusuário (ex.: postgres):
--     psql -U postgres -f database/postgres/01_create_database.sql
--  Ajuste o nome do banco, do usuário e a senha conforme o seu .env
-- =====================================================================

CREATE ROLE loterias_app WITH LOGIN PASSWORD 'troque_esta_senha';

CREATE DATABASE loterias
    WITH OWNER = loterias_app
         ENCODING = 'UTF8'
         TEMPLATE = template0;

GRANT ALL PRIVILEGES ON DATABASE loterias TO loterias_app;
