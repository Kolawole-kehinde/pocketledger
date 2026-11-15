-- Custom SQL migration file, put your code below! --
-- ============================================================
-- 1. Validate posted_balance against the account's normal balance
-- ============================================================

CREATE OR REPLACE FUNCTION validate_ledger_account_posted_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    account_normal_balance TEXT;
    expected_balance NUMERIC(38, 0);
BEGIN
    -- Retrieve the account's normal balance.
    -- Lock both related rows while validating.
    SELECT coa.normal_balance::TEXT
    INTO account_normal_balance
    FROM ledger_accounts AS la
    INNER JOIN chart_of_accounts AS coa
        ON coa.id = la.chart_account_id
    WHERE la.id = NEW.ledger_account_id
    FOR SHARE OF la, coa;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Ledger account % does not exist or has no chart account',
            NEW.ledger_account_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Calculate the expected posted balance.
    IF account_normal_balance = 'CREDIT' THEN
        expected_balance := NEW.total_credits - NEW.total_debits;

    ELSIF account_normal_balance = 'DEBIT' THEN
        expected_balance := NEW.total_debits - NEW.total_credits;

    ELSE
        RAISE EXCEPTION
            'Unsupported normal balance: %',
            account_normal_balance;
    END IF;

    -- Reject inconsistent balance projections.
    IF NEW.posted_balance IS DISTINCT FROM expected_balance THEN
        RAISE EXCEPTION
            'Invalid posted balance for ledger account %. Expected: %, Received: %',
            NEW.ledger_account_id,
            expected_balance,
            NEW.posted_balance
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER ledger_account_posted_balance_validation
BEFORE INSERT OR UPDATE
ON ledger_account_balances
FOR EACH ROW
EXECUTE FUNCTION validate_ledger_account_posted_balance();


-- ============================================================
-- 2. Prevent SYSTEM accounts from having held funds
-- ============================================================

CREATE OR REPLACE FUNCTION validate_ledger_account_held_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    account_owner_type TEXT;
BEGIN
    SELECT la.owner_type::TEXT
    INTO account_owner_type
    FROM ledger_accounts AS la
    WHERE la.id = NEW.ledger_account_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Ledger account % does not exist',
            NEW.ledger_account_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF account_owner_type = 'SYSTEM'
       AND NEW.held_amount <> 0 THEN

        RAISE EXCEPTION
            'System ledger accounts cannot have held funds. Account: %',
            NEW.ledger_account_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER ledger_account_held_amount_validation
BEFORE INSERT OR UPDATE
ON ledger_account_balances
FOR EACH ROW
EXECUTE FUNCTION validate_ledger_account_held_amount();


-- ============================================================
-- 3. Protect ledger account classification
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_ledger_account_classification_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.owner_type IS DISTINCT FROM OLD.owner_type
       OR NEW.wallet_id IS DISTINCT FROM OLD.wallet_id
       OR NEW.system_account_definition_id
            IS DISTINCT FROM OLD.system_account_definition_id
       OR NEW.chart_account_id IS DISTINCT FROM OLD.chart_account_id
       OR NEW.currency IS DISTINCT FROM OLD.currency THEN

        RAISE EXCEPTION
            'Ledger account ownership, classification and currency are immutable';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER ledger_account_classification_immutable
BEFORE UPDATE OF
    owner_type,
    wallet_id,
    system_account_definition_id,
    chart_account_id,
    currency
ON ledger_accounts
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_account_classification_change();


-- ============================================================
-- 4. Protect chart account normal balance after account usage
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_chart_normal_balance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.normal_balance IS DISTINCT FROM OLD.normal_balance
       AND EXISTS (
           SELECT 1
           FROM ledger_accounts AS la
           WHERE la.chart_account_id = OLD.id
       ) THEN

        RAISE EXCEPTION
            'Cannot change normal balance after a chart account has been assigned to a ledger account';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER chart_account_normal_balance_immutable
BEFORE UPDATE OF normal_balance
ON chart_of_accounts
FOR EACH ROW
EXECUTE FUNCTION prevent_chart_normal_balance_change();
