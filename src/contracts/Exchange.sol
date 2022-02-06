pragma solidity >=0.4.22 <0.9.0;

import "./Token.sol";

// TO DO:
// [X] Set the fee account
// [] Deposit Ether
// [] Withdraw Ether
// [] Deposit Tokens
// [] Withdraw Tokens
// [] Check balances
// [] Make order
// [] Cancel order
// [] Fill order
// [] Charge fees

contract Exchange {
    //vars
    address public feeAccount; // receive exchange fees
    uint256 public feePercent; // the fee percentage

    constructor(address _feeAccount, uint256 _feePercent) public {
        feeAccount = _feeAccount;
        feePercent = _feePercent;
    }

    function depositToken(address _token, uint _amount) public {
        Token(_token).transferFrom(msg.sender, address(this), _amount);
        // Which token?
        // How much?
        // Manage deposit - update balance
        // Send token to this contract
        // Emit event

    }
}